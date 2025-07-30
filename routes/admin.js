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

router.get('/kitchen', async (응답, 요청) => {
  const toCookOrders = await db.collection('orders').find({ paid: true, completed: false }).toArray();
  응답.render('admin/kitchen', { toCookOrders });
});

// /admin/server
router.get('/server', async (요청, 응답) => {
  const unpaidOrders = await db.collection('orders').find({ paid: false }).sort({ requestedAt: 1 }).toArray();
  const servingOrders = await db.collection('orders').find({ paid: true, completed: true, served: false }).sort({ completedAt: 1 }).toArray();
  const tableNum = await db.collection('tables').countDocuments();

  응답.render('admin/server', { unpaidOrders, servingOrders, tableNum });
});

// 송금 확인 처리
router.post('/server/confirm', async (요청, 응답) => {
  await db.collection('orders').updateOne({ _id: 요청.query.id }, { $set: { paid: true, paidAt: new Date() } });
  응답.send('송금확인이 완료되었습니다.');
});

// 주문 취소 처리
router.post('/server/delete', async (요청, 응답) => {
  await db.collection('orders').deleteOne({ _id: 요청.query.id });
  응답.send('주문이 삭제되었습니다.');
});

// 서빙 완료 처리
router.post('/server/serve', async (요청, 응답) => {
  await db.collection('orders').update({ _id: 요청.query.id }, { $set: { served: true, servedAt: new Date() } });
  응답.send('서빙이 완료되었습니다.');
});

module.exports = router;
