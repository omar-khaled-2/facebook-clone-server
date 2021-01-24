const express = require('express')
const app = express()
const userRoutes = require('./routes/user.routes')
const postRoutes = require('./routes/post.routes')
const storyRoutes = require('./routes/story.routes')
const notificationRoutes = require('./routes/notification.routes')
const http = require('http')
const path = require('path')
const socketIo = require('socket.io')
const pool = require('./db')


app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(express.static(path.join(__dirname,'static')))



app.use('/posts/',postRoutes) 
app.use('/users/',userRoutes)
app.use('/stories/',storyRoutes)
app.use('/notifications/',notificationRoutes)


app.get('*',(req,res) => {
    res.send('omar')
})


const server = http.createServer(app,{
    pingTimeout:60000,
    pingInterval:5000
})


const io = socketIo(server)

io.use((socket,next) => {
    socket.id = socket.handshake.query.uid
    next()
})



io.on('connection',(socket) => {
    socket.on('join',(roomName) => {
        socket.join(roomName.toString())
    })    
    
    socket.on('leave',(roomName) => {
        socket.leave(roomName.toString())

    })


    socket.on('add_comment',async(payload) => {
        const uid = +socket.id
        let {post_id,text} = payload
        const comment = (await pool.query("with newcomment as(INSERT INTO comment(text,post_id,uid) VALUES($1,$2,$3) RETURNING *) SELECT comment_id,name,newcomment.created_at,newcomment.uid,text,avatar FROM newcomment INNER JOIN users on newcomment.uid = users.uid LEFT OUTER JOIN (SELECT uid, JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = newcomment.uid",[text,post_id,+uid])).rows[0]
        io.to(`post-${post_id}`).emit('comment',comment)
        const post_uid = (await pool.query("SELECT uid FROM post WHERE post_id = $1",[post_id])).rows[0].uid
        if(post_uid != uid){
            const notification = (await pool.query("with noti as (INSERT INTO notification(uid,to_uid,text) VALUES($1,$2,$3) RETURNING *)SELECT name,noti.uid,post_id,text,notification_id,avatar,created_at,seen FROM noti INNER JOIN users on users.uid = noti.uid LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid",[+uid,post_uid,'commented on your post'])).rows[0]
            io.to(post_uid.toString()).emit('notification',notification)
        }
    })

    socket.on('confirm_friend_request',async(id) => {
        const uid = +socket.id
        await pool.query('INSERT INTO friend(uid,friend_uid) VALUES($1,$2)',[uid,id])
        await pool.query('INSERT INTO friend(uid,friend_uid) VALUES($1,$2)',[id,uid])
        await pool.query("DELETE FROM friend_request WHERE uid = $1 and to_uid = $2",[id,uid])
        const notification = (await pool.query("with noti as (INSERT INTO notification(uid,to_uid,text) VALUES($1,$2,$3) RETURNING *)SELECT name,noti.uid,post_id,text,notification_id,avatar,created_at,seen FROM noti INNER JOIN users on users.uid = noti.uid LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid",[uid,id,'and you are friends now'])).rows[0]
        io.to(id.toString()).emit('notification',notification)
    })
    
    socket.on('like_post',async({like,post_id}) => {
        const uid = +socket.id
        const post_uid = (await pool.query('SELECT uid FROM post WHERE post_id = $1',[post_id])).rows[0].uid.toString()
        
        if(like){
            await pool.query('INSERT INTO like_post(uid,post_id) VALUES($1,$2)',[uid,post_id])
            if(post_uid !== uid){
                const notification = (await pool.query("with noti as (INSERT INTO notification(uid,post_id,to_uid,text) VALUES($1,$2,$3,$4) RETURNING *) SELECT name,noti.uid,post_id,text,notification_id,avatar,created_at,seen FROM noti INNER JOIN users on users.uid = noti.uid LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = users.uid",[uid,post_id,post_uid,'reacted to your post'])).rows[0]
                io.to(post_uid).emit('notification',notification)
            } 
        }else{
            await pool.query('DELETE FROM like_post WHERE uid = $1 and post_id = $2',[uid,post_id])
            if(post_uid !== uid){
                const {notification_id} = (await pool.query("DELETE FROM notification where uid = $1 and to_uid = $2 and text = $3 and post_id = $4 returning notification_id",[uid,post_uid,'reacted to your post',post_id])).rows[0]
                io.to(post_uid).emit('remove_notification',notification_id)
            }             
        }
    })

    socket.on('send_friend_request',async(to_uid) => {
        const uid = +socket.id
        const friendRequst = (await pool.query("with newfriendrequest as (INSERT INTO friend_request(uid,to_uid) values($1,$2) returning *) SELECT newfriendrequest.uid,avatar,name from newfriendrequest INNER JOIN users on users.uid = newfriendrequest.uid LEFT OUTER JOIN (SELECT uid,JSON_BUILD_OBJECT('id',avatar.avatar_id,'type',type) as avatar FROM avatar_type INNER JOIN (SELECT uid,MAX(avatar_id)as avatar_id FROM avatar GROUP BY uid ) as avatar on avatar.avatar_id = avatar_type.avatar_id) as avatar on avatar.uid = newfriendrequest.uid",[uid,to_uid])).rows[0]
        io.to(to_uid.toString()).emit('friend_request',friendRequst)
    })
})


const port = process.env.PORT || 5000
server.listen(port,() => {
    console.log('server running port '+ port)

})