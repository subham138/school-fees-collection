const schoolRouter = require('express').Router()
const { db_Select, db_Insert } = require('../../controllers/common_controller');
const dateFormat = require('dateformat');
const bcrypt = require('bcrypt');

schoolRouter.use((req, res, next) => {
    res.locals.currentPage = 'school';
    let user_type = req.session.user.user_data.user_type;
    if (user_type == 'A') {
        next();
    } else {
        req.flash('error_msg', 'You are not authorized to access this page');
        res.redirect('/dashboard/admin');
    }
})

schoolRouter.get('/', async (req, res) => {
    const school_data = await db_Select('school_id, school_name, school_address, contact_person, max_user, reg_date, active_flag', 'md_school', null, null);
    delete school_data.sql;
    res.render('pages/school/view', { 
        title: 'School Management',
        school_data: school_data.suc > 0 ? school_data.msg : [],
        dateFormat
    });
})

schoolRouter.all('/manage', async(req, res) => {
    const request = req.method
    if(request == 'GET') {
        let school_id = req.query.id;
        if (school_id > 0){
            let school_data = await db_Select('*', 'md_school', `school_id=?`, null, [school_id]);
            delete school_data.sql;
            if(school_data.suc > 0 && school_data.msg.length > 0) {
                res.render('pages/school/entry', { 
                    title: 'Manage School',
                    school_data: school_data.msg[0],
                    school_id,
                    dateFormat
                });
            } else {
                req.flash('error_msg', 'School not found');
                res.redirect('/admin/school');
            }
        }else{
            res.render('pages/school/entry', {
                title: 'Manage School',
                school_data: {},
                school_id: 0,
                dateFormat
            });
        }
    } else if(request == 'POST') {
        const reqData = req.body;
        const school_id = parseInt(reqData.school_id) || 0;
        
        const school_name = reqData.school_name;
        const school_address = reqData.school_address;
        const contact_person = reqData.contact_person;
        const phone_no = reqData.phone_no;
        const email_id = reqData.email_id || null;
        const device_type = reqData.device_type;
        const max_user = parseInt(reqData.max_user) || 0;
        const reg_date = reqData.reg_date || dateFormat(new Date(), "yyyy-mm-dd");
        const active_flag = reqData.active_flag || 'Y';
        
        let result;
        if (school_id > 0) {
            // Update existing school
            const fields = 'school_name=?, school_address=?, contact_person=?, phone_no=?, email_id=?, device_type=?, max_user=?, reg_date=?, active_flag=?';
            const params = [school_name, school_address, contact_person, phone_no, email_id, device_type, max_user, reg_date, active_flag, school_id];
            result = await db_Insert('md_school', fields, null, 'school_id=?', 1, params);
        } else {
            // Insert fresh school
            const fields = '(school_name, school_address, contact_person, phone_no, email_id, device_type, max_user, reg_date, active_flag, delete_flag)';
            const values = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            const params = [school_name, school_address, contact_person, phone_no, email_id, device_type, max_user, reg_date, active_flag, 'N'];
            result = await db_Insert('md_school', fields, values, null, 0, params);
        }
        
        if (result.suc > 0) {
            try {
                const target_school_id = school_id > 0 ? school_id : result.lastId;
                const username = email_id || phone_no;

                const userCheck = await db_Select('id', 'md_user', 'school_id = ? AND user_type = "B"', null, [target_school_id]);
                if (userCheck.suc > 0 && userCheck.msg.length > 0) {
                    // Update existing school admin user
                    const fields = 'user_id=?, active_flag=?';
                    const params = [username, active_flag, target_school_id];
                    await db_Insert('md_user', fields, null, 'school_id = ? AND user_type = "B"', 1, params);
                } else {
                    // Create new school admin user with default password '1234'
                    const hashedPassword = await bcrypt.hash("1234", 10);
                    const fields = '(school_id, user_type, password, user_id, active_flag, delete_flag)';
                    const values = '(?, ?, ?, ?, ?, ?)';
                    const params = [target_school_id, 'B', hashedPassword, username, active_flag, 'N'];
                    await db_Insert('md_user', fields, values, null, 0, params);
                }
            } catch (err) {
                console.error("Error syncing school user to md_user:", err);
            }

            req.flash('success_msg', school_id > 0 ? 'School updated successfully' : 'School registered successfully');
        } else {
            req.flash('error_msg', 'Operation failed: ' + result.msg);
        }
        res.redirect('/admin/school');
    } else {
        res.status(405).send('Method Not Allowed');
    }
})

// Fast status toggle route
schoolRouter.get('/toggle-status/:id', async (req, res) => {
    let school_id = req.params.id;
    let school_data = await db_Select('active_flag', 'md_school', 'school_id=?', null, [school_id]);
    if (school_data.suc > 0 && school_data.msg.length > 0) {
        let new_flag = school_data.msg[0].active_flag === 'Y' ? 'N' : 'Y';
        let result = await db_Insert('md_school', 'active_flag=?', null, 'school_id=?', 1, [new_flag, school_id]);
        if (result.suc > 0) {
            // Keep md_user status in sync
            await db_Insert('md_user', 'active_flag=?', null, 'school_id = ? AND user_type = "B"', 1, [new_flag, school_id]);
            req.flash('success_msg', 'School status updated successfully');
        } else {
            req.flash('error_msg', 'Failed to toggle status');
        }
    } else {
        req.flash('error_msg', 'School not found');
    }
    res.redirect('/admin/school');
});

module.exports = {schoolRouter};