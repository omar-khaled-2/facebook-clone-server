const express = require('express')
const pool = require('../db')
const router = express.Router()
const authenticate = require('../middlewares/auth.middleware')


router.put('/:id/seen',async(req,res) => {
    const {id} = req.params
    await pool.query('UPDATE notification SET seen = TRUE WHERE notification_id = $1',[id])
    res.sendStatus(200)
})


router.get('/',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {rows} = await pool.query("SELECT name,notification.uid,post_id,text,notification_id,avatar,created_at,seen FROM notification INNER JOIN users on users.uid = notification.uid LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid WHERE notification.to_uid = $1",[uid])
    res.status(200).json({notifications:rows})
})

router.delete('/:id',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {id} = req.params
    const notification = (await pool.query('SELECT to_uid FROM notification WHERE notification_id = $1',[id])).rows[0]
    if(!notification || notification.to_uid !== uid) return res.sendStatus(400)
    await pool.query('DELETE FROM notification WHERE notification_id = $1',[id])
    return res.sendStatus(200)
})



module.exports = router