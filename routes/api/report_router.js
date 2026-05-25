const reportRouter = require('express').Router();
const { db_Select } = require('../../controllers/common_controller');

// GET /daily
reportRouter.get('/daily', async (req, res) => {
    const { date } = req.query;
    const agent_code = req.user.agent_code;
    const school_id = req.user.school_id;

    if (!date) {
        return res.json({ suc: 0, msg: "Date parameter is required" });
    }

    try {
        const sql = `
            SELECT 
                c.receipt_no, 
                c.transaction_date, 
                c.account_dtls_id, 
                c.student_name, 
                c.guardian_name, 
                c.deposit_amount, 
                c.collection_month, 
                c.remarks, 
                c.collected_at,
                a.class_no,
                a.roll_no
            FROM td_collection c
            LEFT JOIN td_account_dtls a ON c.account_dtls_id = a.account_dtls_id
            WHERE c.agent_code = ? AND c.school_id = ? AND c.transaction_date = ?
            ORDER BY c.collected_at DESC
        `;
        const result = await db_Select(
            'receipt_no', 
            'td_collection', 
            'agent_code = ?', 
            null, 
            [agent_code, school_id, date], 
            true, 
            sql
        );

        const list = result.suc > 0 ? result.msg : [];
        const totalAmount = list.reduce((sum, item) => sum + (item.deposit_amount || 0), 0);

        res.json({
            suc: 1,
            msg: list,
            total_amount: totalAmount
        });
    } catch (error) {
        console.error("Daily Report Error:", error);
        res.json({ suc: 0, msg: "Failed to fetch daily report" });
    }
});

// GET /date-wise-summary
reportRouter.get('/date-wise-summary', async (req, res) => {
    const { from_date, to_date } = req.query;
    const agent_code = req.user.agent_code;
    const school_id = req.user.school_id;

    if (!from_date || !to_date) {
        return res.json({ suc: 0, msg: "from_date and to_date parameters are required" });
    }

    try {
        const sql = `
            SELECT 
                transaction_date, 
                COUNT(receipt_no) as total_receipts, 
                SUM(deposit_amount) as total_amount
            FROM td_collection
            WHERE agent_code = ? AND school_id = ? AND transaction_date BETWEEN ? AND ?
            GROUP BY transaction_date
            ORDER BY transaction_date DESC
        `;
        const result = await db_Select(
            'transaction_date', 
            'td_collection', 
            'agent_code = ?', 
            null, 
            [agent_code, school_id, from_date, to_date], 
            true, 
            sql
        );

        res.json({
            suc: 1,
            msg: result.suc > 0 ? result.msg : []
        });
    } catch (error) {
        console.error("Date Wise Summary Error:", error);
        res.json({ suc: 0, msg: "Failed to fetch date wise summary collection" });
    }
});

module.exports = { reportRouter };
