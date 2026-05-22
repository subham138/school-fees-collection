const db = require("../config/db");
// const dateFormat = require("dateformat");

const db_Select = async (select, table_name, whr, order, params = [], isFullQuery = false, fullQuery = null) => {
    const tb_whr = whr ? `WHERE ${whr}` : "";
    const tb_order = order ? order : "";
    const sql = isFullQuery ? fullQuery : `SELECT ${select} FROM ${table_name} ${tb_whr} ${tb_order}`;

    try {
        const [result] = await db.query(sql, params);
        return { suc: 1, msg: result, sql };
    } catch (err) {
        console.error(err);
        return { suc: 0, msg: JSON.stringify(err) };
    }
};

const db_Insert = async (table_name, fields, values, whr, flag, params = [], full_insert = false, full_insert_sql = '') => {
    const tb_whr = whr ? `WHERE ${whr}` : "";
    const sql = flag > 0
        ? `UPDATE ${table_name} SET ${fields} ${tb_whr}`
        : `INSERT INTO ${table_name} ${!full_insert ? `${fields} VALUES ${values}` : full_insert_sql}`;
    const msg = flag > 0 ? "Updated Successfully !!" : "Inserted Successfully !!";

    try {
        const [result] = await db.query(sql, params);
        return { suc: 1, msg, lastId: result.insertId || result.affectedRows };
    } catch (err) {
        console.error(err);
        return { suc: 0, msg: JSON.stringify(err) };
    }
};

const db_Delete = async (table_name, whr, params = []) => {
    const tb_whr = whr ? `WHERE ${whr}` : "";
    const sql = `DELETE FROM ${table_name} ${tb_whr}`;

    try {
        const [result] = await db.query(sql, params);
        return { suc: 1, msg: "Deleted Successfully !!", affectedRows: result.affectedRows };
    } catch (err) {
        console.error(err);
        return { suc: 0, msg: JSON.stringify(err) };
    }
};

const db_Check = async (fields, table_name, whr) => {
    const sql = `SELECT ${fields} FROM ${table_name} WHERE ${whr}`;

    try {
        const [result] = await db.query(sql);
        return { suc: 1, msg: result.length };
    } catch (err) {
        console.error(err);
        return { suc: 0, msg: JSON.stringify(err) };
    }
};

module.exports = {
    db_Select,
    db_Insert,
    db_Delete,
    db_Check
};