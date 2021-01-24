const jwt = require('jsonwebtoken')
const pool = require('../db')

const getUserFromDatabase = async (fullInfo,uid) => {
    if(fullInfo) return (await pool.query("SELECT users.uid,name,email,avatar,verification FROM users LEFT OUTER JOIN (SELECT uid, JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid WHERE users.uid = $1",[uid])).rows[0]
    return (await pool.query('SELECT uid,verification FROM users WHERE uid = $1',[uid])).rows[0]
}

const authenticate = (config = {
    fullInfo:false,
    notRequireVerification:false
}) => {
    return async(req,res,next) => {

        try {
            const token = req.headers.token
            const uid = jwt.verify(token,'sphinx')
            const user = await getUserFromDatabase(config.fullInfo,uid)
            if(!user) return res.sendStatus(401)
            if(!config.notRequireVerification && !user.verification) return res.status(401).json({
                error:'Verify your E-mail Address'
            })
            req.user = user
            return next()
        } catch (error) {
            res.sendStatus(401)
        }
    }

}


module.exports = authenticate