const express = require('express')
const pool = require('../db')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const rootDir = path.dirname(require.main.filename);
const nodemailer = require('nodemailer')
const authenticate = require('../middlewares/auth.middleware.js')

require('dotenv').config()


const getmediaType = (fileMimeType) => {
    if(fileMimeType === 'image/jpeg') return 'image'
    if(fileMimeType === 'video/mp4') return 'video'
    throw Error('file type is not supported')
}


const storageProfilePic = multer.diskStorage({
    destination:(req,file,done) => {
        const mediaType = getmediaType(file.mimetype)
        return done(null,path.join(rootDir,'static',mediaType + 's','profile'))
    },
    filename:async(req,file,done) => {
        const {rows} = await pool.query('INSERT INTO avatar(uid) VALUES($1) RETURNING avatar_id',[req.user.uid])
        const id = rows[0].avatar_id
        const mediaType = getmediaType(file.mimetype)
        await pool.query('INSERT INTO avatar_type(avatar_id,type) VALUES($1,$2)',[id,mediaType])
        req.avatar = {id,type:mediaType}
        return done(null,`${id}.${mediaType === 'image' ? 'jpg' : 'mp4' }`)
    }
})

const uploadProfilepic = multer({storage:storageProfilePic})


const storageCoverPic = multer.diskStorage({
    destination:(req,file,done) => {
        return done(null,path.join(rootDir,'static','images','cover'))
    },
    filename:async(req,file,done) => {
        const {rows} = await pool.query('INSERT INTO cover_img(uid) VALUES($1) RETURNING cover_img_id',[req.user.uid])
        req.id = rows[0].cover_img_id
        return done(null,`${req.id}.jpg`)
    }
})

const uploadCoverPic = multer({storage:storageCoverPic})


const sendVeritication = async (email,firstName,host,protocol) => {
    const token = jwt.sign(email,'sphinx')
    const link = `${protocol}://${host}/users/verify/${token}`
    console.log(link)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD
        }
    })
    await transporter.sendMail({
        to:email,
        from: process.env.EMAIL,
        subject: "Verify your E-mail",
        html:`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document</title>
          </head>
          <body style="min-width:300px;align-items: center;background:#f0f2f5;display: flex;flex-direction: column;flex:1">
            <h1 style='color:#1877f2'>Facebook</h1>
            <h3 style="margin-bottom:50px ;">Verify your email address</h3>
            <a href="${link}" target="_blank" rel="noopener noreferrer" style=><button style="height: 50px;width: 150px;border: none;outline:none;background:#1877F2;color:white;font-weight:bold">Verify Your Email</button></a>
          </body>
        </html>
        `
    });
}



router.post('/signup',async(req,res) => {
    try {
        const {firstName,lastName,email,password,birthday} = req.body
        const host = req.get('host')
        const protocol = req.protocol
        const user = (await pool.query('SELECT 1 FROM users WHERE email = $1',[email])).rows[0]
        if(user) return res.status(400).json({
            error:'That Email address already exists'
        })
        const name = `${firstName[0].toUpperCase()}${firstName.slice(1).toLowerCase()} ${lastName[0].toUpperCase()}${lastName.slice(1).toLowerCase()}`
        const hashPassword = await bcrypt.hash(password,5)
        const uid = (await pool.query('INSERT INTO users(name,email,password) VALUES($1,$2,$3) RETURNING uid',[name,email,hashPassword])).rows[0].uid
        await pool.query('INSERT INTO user_birthday(uid,birthday) VALUES($1,$2)',[uid,birthday])
        await pool.query('INSERT INTO user_bio(uid) VALUES($1)',[uid])
        await sendVeritication(email,firstName,host,protocol)
        const token = jwt.sign(uid,'sphinx')
        return res.status(200).json({
            token
        })
    } catch (error) {
        res.status(500).json({
            error:error.message
        })
    }
})


router.post('/login',async(req,res) => {
    const {email,password} = req.body
    try {
        if(email && password){
            const user = (await pool.query("SELECT uid,password,verification FROM users WHERE email = $1",[email])).rows[0]
            if(!user) return res.status(400).json({
                error:'E-mail does not Exist'
            })
            const checkPassword = await bcrypt.compare(password,user.password)
            if(!checkPassword) return res.status(400).json({
                error:'Password is Invaild'
            })

            const token = jwt.sign(user.uid,'sphinx')
            res.status(200).json({
                token,
            })
        }else{
            return res.status(400).json({
                error:'Email And Password are required'
            })
        }
    } catch (error) {
        res.sendStatus(500)
    }
})



router.get('/verify/:token',async(req,res) => {
    const token = req.params.token
    const email = jwt.verify(token,'sphinx')
    await pool.query('UPDATE users SET verification = true WHERE email = $1',[email])
    return res.sendStatus(200)
})



router.put('/avatar',authenticate({notRequireVerification:true}),uploadProfilepic.single('avatar'),async(req,res) => {
    res.status(200).json({avatar:req.avatar})
})


router.get('/search',async(req,res) => {
    const search = req.query.search
    const {rows} = await pool.query("SELECT uid,name FROM users WHERE name ILIKE $1",[`${search}%`])
    res.status(200).json({
        users:rows
    })
})
router.put('/cover',authenticate(),uploadCoverPic.single('img'),(req,res) => {
    res.sendStatus(200)
})

router.get('/bio',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {rows} = await pool.query('SELECT bio FROM users WHERE uid = $1',[uid])
    res.status(200).json({bio:rows[0].bio})
})


router.get('/',authenticate({fullInfo:true}),(req,res) => {
    res.status(200).json({
        user:req.user
    })
})

router.get('/user/:uid',async(req,res) => {

    const {uid} = req.params
    const resUser = await pool.query("SELECT users.uid,name,email,avatar,cover_img_id FROM users LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid LEFT OUTER JOIN (SELECT uid,MAX(cover_img_id) as cover_img_id FROM cover_img GROUP BY uid) as cover_img on cover_img.uid = users.uid WHERE users.uid = $1",[uid])
    const resPosts = await pool.query("SELECT name,post.post_id,avatar,post.text,post.created_at,post.uid,medias,CASE WHEN likes IS NULL THEN array[]::integer[] ELSE likes END as likes,CASE WHEN comments_count IS NULL THEN 0 ELSE comments_count END as comments_count FROM post INNER JOIN users on users.uid = post.uid  LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = post.uid LEFT OUTER JOIN (SELECT post_id,COUNT(*) as comments_count FROM COMMENT GROUP BY post_id)as comments on comments.post_id = post.post_id LEFT OUTER JOIN (SELECT post_id,ARRAY_AGG(uid) as likes FROM like_post GROUP by post_id)as likes on likes.post_id = post.post_id LEFT OUTER JOIN (SELECT post_id,ARRAY_AGG(JSON_BUILD_OBJECT('id',post_media_id,'type',type))as medias FROM post_media GROUP BY post_id) as media on media.post_id = post.post_id WHERE post.uid = $1 ORDER BY post.created_at DESC",[uid])
    const resStory = await pool.query("SELECT users.uid,name,stories,avatar FROM users LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid INNER JOIN (SELECT uid,ARRAY_AGG(story_id) as stories FROM story WHERE created_at + INTERVAL'1 day' > CURRENT_TIMESTAMP  GROUP BY uid)as story on users.uid = story.uid WHERE story.uid = $1",[uid])
    res.status(200).json({
        posts: resPosts.rows,
        story:resStory.rows[0],
        user: resUser.rows[0],
    })
})

router.get('/mayknow',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {rows} = await pool.query("SELECT name,users.uid,avatar FROM users LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid WHERE users.uid != $1 and users.uid NOT IN (SELECT friend_uid from friend where uid =  $1)",[uid])
    res.status(200).json({users:rows})
})


router.get('/requests',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {rows} = await pool.query("SELECT friend_request.uid,avatar,name from friend_request INNER JOIN users on users.uid = friend_request.uid LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid WHERE to_uid = $1",[uid])
    res.status(200).json({users:rows})
})


router.post('/requests/:id',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {id} = req.params
    await pool.query('INSERT INTO friend(uid,friend_uid) VALUES($1,$2)',[uid,id])
    await pool.query('INSERT INTO friend(uid,friend_uid) VALUES($1,$2)',[id,uid])
    await pool.query("DELETE FROM friend_request WHERE uid = $1 and to_uid = $2",[id,uid])
    res.sendStatus(200)
})


router.delete('/requests/:id',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {id} = req.params
    await pool.query("DELETE FROM friend_request WHERE uid = $1 and to_uid = $2",[id,uid])
    res.sendStatus(200)
})

module.exports = router