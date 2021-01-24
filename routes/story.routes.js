const express = require('express')
const pool = require('../db')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const authenticate = require('../middlewares/auth.middleware')
const rootDir = path.dirname(require.main.filename);


const getMediaType = (fileMimeType) => {
    if(fileMimeType === 'image/jpeg') return 'image'
    if(fileMimeType === 'video/mp4') return 'video'
    throw Error('file type is not supported')
}



const storage = multer.diskStorage({
    destination:(req,file,done) => {
        const type = getMediaType(file.mimetype)
        return done(null,path.join(rootDir,'static',type + 's','stories'))
    
    },
    filename:async(req,file,done) => {
        const {uid} = req.user
        const type = getMediaType(file.mimetype)
        const {rows} = await pool.query('INSERT INTO story(uid,type) values($1,$2) RETURNING story_id',[uid,type])
        return done(null,`${rows[0].story_id}.${type === 'image' ? 'jpg' : 'mp4'}`)
    }
})

const upload = multer({storage})

router.post('/',authenticate(),upload.single('img'),async(req,res) => {
    res.sendStatus(200)
})

router.get('/',authenticate(),async(req,res) => {
    const {uid} = req.user
    const result = await pool.query("SELECT users.uid,name,stories,avatar FROM users LEFT OUTER JOIN (SELECT uid, JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid INNER JOIN (SELECT uid,ARRAY_AGG(JSON_BUILD_OBJECT('id',story_id,'type',type,'created_at',created_at)) as stories FROM story WHERE created_at + INTERVAL'1 day' > CURRENT_TIMESTAMP  GROUP BY uid)as story on users.uid = story.uid WHERE story.uid = $1 OR story.uid in (SELECT friend_uid FROM friend WHERE uid = $1)",[uid])
    res.status(200).json({
        stories:result.rows
    })
})

module.exports = router