const loginRouter = require('express').Router(),
    bcrypt = require('bcrypt'),
    { db_Select } = require('../../controllers/common_controller'),
    dateFormat = require("dateformat");

loginRouter.get('/', (req, res) => {
    res.render('pages/common/login', { layout: false, title: 'Login' });
})

loginRouter.post('/', async (req, res) => {
    const { username, password } = req.body;
    console.log(username, password);
    try {
        var whr = `user_id='${username}' AND active_flag='Y' AND user_type IN ('A', 'B')`;
        let res_dt = await db_Select('password,user_type', "md_user", whr, null);
        delete res_dt.sql;

        if (res_dt.msg[0] && await bcrypt.compare(password, res_dt.msg[0].password)) {

            if (res_dt.msg[0].user_type == 'B') {
                var table_name = "md_user a,md_school b",
                    whrDAta = `a.school_id=b.school_id AND a.user_id='${username}' AND a.active_flag='Y'`,
                    selectData = "a.user_type,a.id, a.school_id, a.device_sl_no, a.device_id, a.user_id, a.pin_no, a.profile_pic,b.*";
            } else if (res_dt.msg[0].user_type == 'A') {
                var table_name = "md_user a",
                    whrDAta = `a.user_id='${username}' AND a.active_flag='Y'`,
                    selectData = "a.user_type,a.id, a.school_id, a.device_sl_no, a.device_id, a.user_id, a.pin_no, a.profile_pic";
            }

            let user_data = await db_Select(selectData, table_name, whrDAta, null);
            if (user_data.suc > 0 && user_data.msg.length > 0) {
                var table_name = "td_logo",
                    where = `school_id='${user_data.msg[0].school_id}'`,
                    select = 'file_path'
    
                let logo_data = await db_Select(select, 'td_logo', where, null);
                delete user_data.sql;
    
                const datetime = dateFormat(new Date(), "dd/mm/yyyy hh:MM:ss")
                req.session['user'] = { user_data: user_data.msg[0], logo_data, datetime }
                if (res_dt.msg[0].user_type == 'A') {
                    res.redirect('/dashboard/super-admin')
                } else {
                    req.flash('success', 'login successful')
                    res.redirect('/dashboard/admin')
                }
            }else{
                req.flash('error', 'User data not found, Please contact to admin')
                res.redirect('/login')
            }
        } else {
            req.flash('error', 'Invalid username or password or Deactivate By Admin')
            res.redirect('/login')
        }


    } catch (error) {
        console.log(error);
        
        req.flash('error', 'Something went wrong, Please try again later')
        res.redirect('/login')
    }

})

module.exports = { loginRouter };