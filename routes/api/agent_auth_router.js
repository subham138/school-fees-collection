const agentAuthRouter = require('express').Router();
const { db_Select, db_Insert } = require('../../controllers/common_controller');
const jwt = require('jsonwebtoken');

// POST /device-check
agentAuthRouter.post('/device-check', async (req, res) => {
    const { device_id } = req.body;
    if (!device_id) return res.json({ suc: 0, msg: "Device ID required" });

    try {
        // Find agent mapped to this device in md_user (user_type = 'O' for agent)
        const sql = `
            SELECT u.user_id as agent_code, a.agent_name, a.school_id, s.school_name, a.print_opt, a.printer_type 
            FROM md_user u
            JOIN md_agent a ON u.user_id = a.agent_code AND u.school_id = a.school_id
            JOIN md_school s ON a.school_id = s.school_id
            WHERE u.device_id = ? AND u.user_type = 'O' AND u.active_flag = 'Y' AND a.delete_flag = 'N' AND a.active_flag = 'Y'
        `;
        const userSelect = await db_Select('u.user_id', 'md_user u', 'u.device_id = ? AND u.user_type = "O"', null, [device_id], true, sql);

        if (userSelect.suc > 0 && userSelect.msg.length > 0) {
            const agent = userSelect.msg[0];
            res.json({ suc: 1, mapped: true, agent_data: agent });
        } else {
            res.json({ suc: 1, mapped: false, msg: "Device not registered." });
        }
    } catch (error) {
        console.error("Device Check Error:", error);
        res.json({ suc: 0, msg: "Internal server error" });
    }
});

// POST /verify-pin
agentAuthRouter.post('/verify-pin', async (req, res) => {
    const { device_id, pin } = req.body;
    console.log(req.body);
    
    if (!device_id || !pin) return res.json({ suc: 0, msg: "Device ID and PIN required" });

    try {
        const sql = `
            SELECT u.id, u.user_id as agent_code, u.school_id, u.password 
            FROM md_user u
            WHERE u.device_id = ? AND u.user_type = 'O' AND u.active_flag = 'Y'
        `;
        const userSelect = await db_Select('u.id', 'md_user', 'u.device_id = ?', null, [device_id], true, sql);

        console.log(userSelect);
        

        if (userSelect.suc > 0 && userSelect.msg.length > 0) {
            const user = userSelect.msg[0];
            
            // Generate JWT
            const token = jwt.sign(
                { id: user.id, agent_code: user.agent_code, school_id: user.school_id, device_id },
                process.env.JWT_SECRET || 'school_collection_jwt_secret_2024',
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );

            res.json({ suc: 1, msg: "Login successful", token });
        } else {
            res.json({ suc: 0, msg: "Invalid PIN or Device" });
        }
    } catch (error) {
        console.error("Verify PIN Error:", error);
        res.json({ suc: 0, msg: "Internal server error" });
    }
});

module.exports = { agentAuthRouter };
