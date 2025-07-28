const router = require('express').Router();

let connectDB = require('./../database.js');

let db;
connectDB
  .then((client) => {
    db = client.db('picatong-qr-order');
  })
  .catch((err) => {
    console.log(err);
  });

router.get('/menu', async (요청, 응답) => {
  let result = await db.collection('menus').find().toArray();
  응답.render('admin-menu.ejs', { menus: result });
});

router.post('/menu', (요청, 응답) => {
  upload.single('img1')(요청, 응답, async (err) => {
    if (err) return 응답.send('이미지 업로드 에러');
    try {
      if (요청.body.title == '' || 요청.body.price == '') {
        응답.send('다 입력해야 함.');
      } else {
        await db.collection('post').insertOne({
          name: 요청.body.name,
          price: 요청.body.price,
          category: 요청.body.category,
          isActive: 요청.body.isActive == '판매 중' ? true : false,
          img: 요청.file ? 요청.file.location : '',
        });
        응답.redirect('/list');
      }
    } catch (e) {
      console.log(e);
      응답.status(500).send('서버 에러');
    }
  });
});

module.exports = router;
