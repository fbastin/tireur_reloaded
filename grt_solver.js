/**
 * GRT Internal Ballistics Solver
 * Implements a lumped-parameter thermodynamic simulation of small arms cartridges.
 * Uses 4th-order Runge-Kutta (RK4) integration.
 */
class GrtSolver {
    static getPhi(z, a0, z1, z2) {
        if (z <= 0) return 1.0;
        if (z >= 1.0) return 0.0;
        if (z <= z1) {
            return (1.0 - z) * (1.0 + a0 * z);
        } else if (z <= z2) {
            const phi1 = (1.0 - z1) * (1.0 + a0 * z1);
            const phi2 = (1.0 - z2);
            const t = (z - z1) / (z2 - z1);
            return phi1 * (1.0 - t) + phi2 * t;
        } else {
            const phi2 = (1.0 - z2);
            const t = (z - z2) / (1.0 - z2);
            return phi2 * (1.0 - t);
        }
    }

    /**
     * Runs the internal ballistics simulation.
     * All inputs should be in standard units:
     * - bullet_mass_gr: grains
     * - charge_mass_gr: grains
     * - case_volume_gr_h2o: grains of water
     * - seating_depth_mm: mm
     * - bore_area_mm2: mm2
     * - barrel_length_mm: mm
     * - case_length_mm: mm
     * - powder: propellant object containing Ba, Qex, k, a0, z1, z2, eta, pc, pcd
     * - P_start_bar: bar (starting engraving pressure)
     * - P_friction_bar: bar (bore friction resistance pressure)
     */
    static solve(inputs) {
        const grains_to_kg = 6.479891e-5;
        
        // Extract inputs
        const m_bullet = inputs.bullet_mass_gr * grains_to_kg; // kg
        const m_charge = inputs.charge_mass_gr * grains_to_kg; // kg
        const V_case = (inputs.case_volume_gr_h2o * 0.0648) * 1e-6; // m3
        const A = inputs.bore_area_mm2 * 1e-6; // m2
        const s_d = inputs.seating_depth_mm * 1e-3; // m
        
        const L_barrel = inputs.barrel_length_mm * 1e-3; // m
        const L_case = inputs.case_length_mm * 1e-3; // m
        
        // Net travel of the bullet in the barrel
        const L_travel = L_barrel - L_case + s_d;
        
        // Effective moving mass (Lagrange kinetic energy of gas correction)
        const m_eff = m_bullet + m_charge / 3.0;
        
        // Propellant properties
        const Ba = parseFloat(inputs.powder.Ba); // bar^-1 s^-1
        const Qex_j = parseFloat(inputs.powder.Qex) * 1e3; // J/kg
        const k = parseFloat(inputs.powder.k);
        const a0 = parseFloat(inputs.powder.a0);
        const z1 = parseFloat(inputs.powder.z1);
        const z2 = parseFloat(inputs.powder.z2);
        const eta = parseFloat(inputs.powder.eta) * 1e-3; // m3/kg (covolume)
        const pc = parseFloat(inputs.powder.pc); // kg/m3 (propellant solid density)
        const pcd = parseFloat(inputs.powder.pcd); // kg/m3 (bulk density)
        
        // Volumes
        const V_bullet_seated = A * s_d;
        const V0 = V_case - V_bullet_seated;
        
        // Bulk volume of powder for load density calculation
        const V_bulk_cm3 = (inputs.charge_mass_gr * 64.8) / pcd;
        const V0_cm3 = V0 * 1e6;
        const fill_ratio = (V_bulk_cm3 / V0_cm3) * 100.0;
        
        // Engraving and friction limits
        const P_start = inputs.P_start_bar * 1e5; // Pa
        const P_friction = inputs.P_friction_bar * 1e5; // Pa
        const beta_loss = 0.15; // standard heat loss fraction (15%)
        
        // Setup initial conditions
        let t = 0.0;
        let x = 0.0;
        let v = 0.0;
        let z = 0.01; // 1% burned on ignition
        let E = m_charge * z * Qex_j * (1.0 - beta_loss); // initial gas energy (J)
        
        const dt = 1.0e-6; // 1 microsecond time step
        const max_steps = 15000;
        
        const results = [];
        let peak_pressure = 0.0;
        let peak_pressure_time = 0.0;
        let peak_pressure_travel = 0.0;
        let bullet_moving = false;
        let barrel_time = 0.0;
        let all_burned_travel = null;
        let all_burned_time = null;
        
        const params = {
            V0, A, mc: m_charge, pc, eta, k, Qex: Qex_j,
            Ba, a0, z1, z2, m_eff, P_start, P_friction, beta_loss
        };
        
        let state = [x, v, z, E];
        
        for (let step = 0; step < max_steps; step++) {
            const current_x = state[0];
            const current_v = state[1];
            const current_z = state[2];
            const current_E = state[3];
            
            // Calculate current pressure
            let V_gas = V0 + A * current_x - m_charge * (1.0 - current_z) / pc - eta * m_charge * current_z;
            if (V_gas <= 1e-9) V_gas = 1e-9;
            let P = current_E * (k - 1.0) / V_gas;
            if (P < 0) P = 0;
            
            if (P > peak_pressure) {
                peak_pressure = P;
                peak_pressure_time = t;
                peak_pressure_travel = current_x;
            }
            
            // Check burn out
            if (current_z >= 1.0 && all_burned_travel === null) {
                all_burned_travel = current_x;
                all_burned_time = t;
            }
            
            // Save state history at regular intervals to limit data size
            if (step % 10 === 0 || current_x >= L_travel) {
                results.push({
                    t: t * 1000.0,            // ms
                    x: current_x * 1000.0,    // mm
                    v: current_v,             // m/s
                    P: P / 1e5,               // bar
                    z: current_z * 100.0,     // %
                    E_gas: current_E          // J
                });
            }
            
            // Exit condition
            if (current_x >= L_travel) {
                barrel_time = t;
                break;
            }
            
            // RK4 solver step
            state = GrtSolver.rk4Step(state, params, dt);
            t += dt;
        }
        
        return {
            trajectory: results,
            muzzle_velocity: state[1], // m/s
            peak_pressure: peak_pressure / 1e5, // bar
            peak_pressure_time: peak_pressure_time * 1000.0, // ms
            peak_pressure_travel: peak_pressure_travel * 1000.0, // mm
            barrel_time: t * 1000.0, // ms
            burned_pct: state[2] * 100.0, // %
            fill_ratio: fill_ratio, // %
            all_burned_travel: all_burned_travel ? all_burned_travel * 1000.0 : null, // mm
            all_burned_time: all_burned_time ? all_burned_time * 1000.0 : null // ms
        };
    }
    
    static rk4Step(state, params, dt) {
        const k1 = GrtSolver.getDerivatives(state, params);
        
        const s2 = state.map((val, i) => val + 0.5 * dt * k1[i]);
        const k2 = GrtSolver.getDerivatives(s2, params);
        
        const s3 = state.map((val, i) => val + 0.5 * dt * k2[i]);
        const k3 = GrtSolver.getDerivatives(s3, params);
        
        const s4 = state.map((val, i) => val + dt * k3[i]);
        const k4 = GrtSolver.getDerivatives(s4, params);
        
        return state.map((val, i) => val + (dt / 6.0) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    }
    
    static getDerivatives(state, params) {
        const x = state[0];
        const v = state[1];
        const z = state[2];
        const E = state[3];
        
        // Gas volume
        let V_gas = params.V0 + params.A * x - params.mc * (1.0 - z) / params.pc - params.eta * params.mc * z;
        if (V_gas <= 1e-9) V_gas = 1e-9;
        
        // Pressure
        let P = E * (params.k - 1.0) / V_gas;
        if (P < 0) P = 0;
        
        // Burn rate dz/dt
        let dz_dt = 0;
        if (z < 1.0) {
            const P_bar = P / 1e5;
            dz_dt = params.Ba * P_bar * GrtSolver.getPhi(z, params.a0, params.z1, params.z2);
            if (dz_dt < 0) dz_dt = 0;
        }
        
        // Projectile acceleration dv/dt
        let ax = 0;
        if (v > 0 || P >= params.P_start) {
            ax = params.A * (P - params.P_friction) / params.m_eff;
            if (v <= 0 && ax < 0) ax = 0;
        }
        
        // Thermal energy rate of change dE/dt
        let dE_dt = params.mc * params.Qex * dz_dt * (1.0 - params.beta_loss);
        if (v > 0 || P >= params.P_start) {
            dE_dt -= P * params.A * v;
        }
        
        return [v, ax, dz_dt, dE_dt];
    }
}

// Node.js support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GrtSolver;
}
