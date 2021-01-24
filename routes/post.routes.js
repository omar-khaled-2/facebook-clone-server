const express = require('express')
const pool = require('../db')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const rootDir = path.dirname(require.main.filename);
const fs = require('fs')
const authenticate = require('../middlewares/auth.middleware')


const getMediaType = (fileMimeType) => {
    if(fileMimeType === 'image/jpeg') return 'image'
    if(fileMimeType === 'video/mp4') return 'video'
    throw Error('file type is not supported')
}

const storage = multer.diskStorage({
    destination:(req,file,done) => {
        return done(null,path.join(rootDir,'static',getMediaType(file.mimetype) + 's','posts'))
    },
    filename:async(req,file,done) => {
        const {post_id} = req.params
        const fileType = getMediaType(file.mimetype)
        const {rows} =await pool.query('INSERT INTO post_media(post_id,type) VALUES($1,$2) RETURNING post_media_id',[post_id,fileType])
        return done(null,`${rows[0].post_media_id}.${fileType === 'video' ? 'mp4' : 'jpg'}`)
    }
})


const upload = multer({storage}) 


router.post('/',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {text} = req.body
    const result = await pool.query('INSERT INTO post(uid,text) VALUES($1,$2) RETURNING post_id',[uid,text])
    return res.status(200).json({
        post_id:result.rows[0].post_id
    })
})

router.put('/:post_id/media',authenticate(),upload.array('media',4),async(req,res) => {
    res.sendStatus(200)
})

router.get('/',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {rows} = await pool.query("SELECT name,post.post_id,avatar,post.text,post.created_at,post.uid,medias,CASE WHEN likes IS NULL THEN array[]::integer[] ELSE likes END as likes,CASE WHEN comments_count IS NULL THEN 0 ELSE comments_count END as comments_count FROM post INNER JOIN users on users.uid = post.uid LEFT OUTER JOIN (SELECT uid, JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = post.uid LEFT OUTER JOIN (SELECT post_id,COUNT(*) as comments_count FROM COMMENT GROUP BY post_id)as comments on comments.post_id = post.post_id LEFT OUTER JOIN (SELECT post_id,ARRAY_AGG(uid) as likes FROM like_post GROUP by post_id)as likes on likes.post_id = post.post_id LEFT OUTER JOIN (SELECT post_id,ARRAY_AGG(JSON_BUILD_OBJECT('id',post_media_id,'type',type))as medias FROM post_media GROUP BY post_id) as media on media.post_id = post.post_id WHERE post.uid = $1 OR post.uid in (SELECT friend_uid FROM friend WHERE uid = $1) ORDER BY post.created_at DESC",[uid])
    return res.status(200).json({
        posts : rows
    })
})
router.get('/videos',async(req,res) => {
    const {rows} = await pool.query("SELECT name,post.post_id,avatar,post.text,post.created_at,post.uid,medias,CASE WHEN likes IS NULL THEN array[]::integer[] ELSE likes END as likes,CASE WHEN comments_count IS NULL THEN 0 ELSE comments_count END as comments_count FROM post INNER JOIN users on users.uid = post.uid LEFT OUTER JOIN (SELECT uid, JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = post.uid LEFT OUTER JOIN (SELECT post_id,COUNT(*) as comments_count FROM COMMENT GROUP BY post_id)as comments on comments.post_id = post.post_id LEFT OUTER JOIN (SELECT post_id,ARRAY_AGG(uid) as likes FROM like_post GROUP by post_id)as likes on likes.post_id = post.post_id INNER JOIN (select post_id,ARRAY_AGG(JSON_BUILD_OBJECT('id',post_media_id,'type',type))as medias from post_media group by post_id HAVING array_length(array_agg(type),1) = 1 and (array_agg(type))[1] = 'video') as media on media.post_id = post.post_id ORDER BY post.created_at DESC")
    return res.status(200).json({
        posts : rows
    })
})

router.post('/:post_id/like',authenticate(),async(req,res) =>{
    const {uid} = req.user
    const {like} = req.body
    const {post_id} = req.params

    try {
        if(like){
            await pool.query('INSERT INTO like_post(uid,post_id) VALUES($1,$2)',[uid,post_id])
        }else{
            await pool.query('DELETE FROM like_post WHERE uid = $1 and post_id = $2',[uid,post_id])
        }
        return res.sendStatus(200)
    } catch (error) {
        return res.sendStatus(500)
    }
})


router.delete('/:post_id',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {post_id} = req.params
    const post_uid = (await pool.query("SELECT uid FROM post WHERE post_id = $1",[post_id])).rows[0].uid
    if(post_uid !== uid) return res.sendStatus(401)
    const files = (await pool.query('SELECT post_media_id,type from post_media where post_id = $1',[post_id])).rows
    files.forEach(file => fs.unlinkSync(path.join(rootDir,'static',file.type + 's','posts',`${file.post_media_id}.${file.type === 'image' ? "jpg" : "mp4" }`)))
    await pool.query('DELETE FROM post WHERE post_id = $1',[post_id])
    return res.sendStatus(200)
})

router.get('/:post_id/comments',async(req,res) => {
    const {post_id} = req.params
    const {rows} = await pool.query("SELECT comment_id,name,comment.created_at,users.uid,text,avatar FROM comment INNER JOIN users on comment.uid = users.uid LEFT OUTER JOIN (SELECT uid, JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = comment.uid WHERE post_id = $1 ORDER BY created_at ASC",[post_id])
    res.status(200).json({comments:rows})
})






module.exports = router