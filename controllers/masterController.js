const { db_Select } = require("./common_controller");

const getSchoolDetails = async (school_id = 0, status = 'A') => {
    return new Promise(async (resolve, reject) => {
        try{
            let select = 'school_id, school_name, school_address, contact_person, phone_no, email_id, device_type, max_user, reg_date, active_flag',
                whr = `active_flag = ? ${school_id > 0 ? `AND school_id = "${school_id}"` : ''}`,
                table_name = 'md_school',
                params = [status];

            const resDt = await db_Select(select, table_name, whr, null, params);
            delete resDt.sql;
            resolve(resDt);
        }catch(error) {
            console.error(error);
            resolve({ suc: 0, msg: JSON.stringify(error) })
        }
    })
}

const getAgentData = (school_id = 0, agent_id = 0, active_flag = 'A') => {
    return new Promise(async (resolve, reject) => {
        try{
            let select = 'a.agent_id, a.agent_code, a.school_id, b.school_name, a.agent_name, a.agent_address, a.phone_no, a.email_id, a.max_amt, a.allow_collection_days, a.printer_type, a.print_opt, a.active_flag',
                whr = `a.active_flag = ? ${school_id > 0 ? `AND a.school_id = "${school_id}"` : ''} ${agent_id > 0 ? `AND a.agent_id = "${agent_id}"` : ''}`,
                table_name = 'md_agent a, md_school b',
                params = [active_flag];

            const resDt = await db_Select(select, table_name, whr, null, params);
            delete resDt.sql;
            resolve(resDt);
        }catch(error) {
            console.error(error);
            resolve({ suc: 0, msg: JSON.stringify(error) })
        }
    })
}

module.exports = {
    getSchoolDetails, getAgentData
}