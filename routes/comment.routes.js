const express = require('express')
const pool = require('../db')
const router = express.Router()
const authenticate = require('../middlewares/auth.middleware')


router.post('/:post_id/',authenticate(),async(req,res) => {
    const {uid} = req.user
    const {text} = req.body
    const {post_id} = req.params
    await pool.query('INSERT INTO comment(text,post_id,uid) VALUES($1,$2,$3)',[text,post_id,uid])
    const result = await pool.query('SELECT comment_id,name,comment.created_at,users.uid,text FROM comment INNER JOIN users on comment.uid = users.uid WHERE post_id = $1 ORDER BY created_at ASC',[post_id])
    const comments = result.rows
    res.status(200).json({
        comments
    })
})

router.get('/:post_id',async(req,res) => {
    const {post_id} = req.params
    const result = await pool.query('SELECT comment_id,name,comment.created_at,users.uid,text FROM comment INNER JOIN users on comment.uid = users.uid WHERE post_id = $1 ORDER BY created_at ASC',[post_id])
    res.status(200).json({
        comments:result.rows
    })
})




module.exports = router