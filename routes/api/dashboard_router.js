const dashboardRouter = require('express').Router();
const { db_Select } = require('../../controllers/common_controller');

// GET /transactions
dashboardRouter.get('/transactions', async (req, res) => {
    const { agent_code, school_id } = req.query;
    try {
        const sql = `
            SELECT agent_trans_no, send_date, coll_flag, end_flag
            FROM md_agent_trans
            WHERE agent_code = ? AND school_id = ?
            ORDER BY sl_no DESC
            LIMIT 5
        `;
        const transactions = await db_Select('agent_trans_no', 'md_agent_trans', 'agent_code = ?', null, [agent_code, school_id], true, sql);
        
        res.json({ suc: 1, msg: transactions.suc > 0 ? transactions.msg : [] });
    } catch (error) {
        console.error("Dashboard Transactions Error:", error);
        res.json({ suc: 0, msg: "Failed to fetch transactions" });
    }
});

// GET /summary
dashboardRouter.get('/summary', async (req, res) => {
    const { agent_code, school_id, agent_trans_no } = req.query;
    if (!agent_trans_no) {
        return res.json({ suc: 0, msg: "Transaction period required" });
    }

    try {
        // 1. Total accounts for this agent and active transaction period
        const accountsSelect = await db_Select('COUNT(*) as total_accounts, SUM(depost_amt) as total_deposit_amount', 'td_account_dtls', 'agent_code = ? AND school_id = ? AND agent_trans_no = ?', null, [agent_code, school_id, agent_trans_no]);
        
        // 2. Collections in this period
        const collSelect = await db_Select('COUNT(*) as collected_count, SUM(deposit_amount) as total_collected_amount', 'td_collection', 'agent_code = ? AND school_id = ? AND agent_trans_no = ?', null, [agent_code, school_id, agent_trans_no]);

        const totalAccounts = accountsSelect.suc > 0 ? accountsSelect.msg[0].total_accounts || 0 : 0;
        const totalDepositAmount = accountsSelect.suc > 0 ? accountsSelect.msg[0].total_deposit_amount || 0 : 0;
        
        const collectedCount = collSelect.suc > 0 ? collSelect.msg[0].collected_count || 0 : 0;
        const totalCollectedAmount = collSelect.suc > 0 ? collSelect.msg[0].total_collected_amount || 0 : 0;

        res.json({
            suc: 1,
            data: {
                totalAccounts,
                collectedCount,
                pendingCount: totalAccounts - collectedCount,
                totalDepositAmount,
                totalCollectedAmount,
                pendingAmount: totalDepositAmount - totalCollectedAmount
            }
        });

    } catch (error) {
        console.error("Dashboard Summary Error:", error);
        res.json({ suc: 0, msg: "Failed to fetch summary" });
    }
});

module.exports = { dashboardRouter };
