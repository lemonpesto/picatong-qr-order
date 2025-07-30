// routes/admin.js
module.exports = (io) => {
  const router = require('express').Router();
  const { ObjectId } = require('mongodb');

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

  // /admin/server
  router.get('/server', async (요청, 응답) => {
    try {
      // 미결제 주문 (송금확인 탭)
      const unpaidOrders = await db.collection('orders').find({ paid: false }).sort({ requestedAt: 1 }).toArray();

      // 결제 끝 && 서빙 전 주문 (서빙 탭)
      const serveOrdersRaw = await db.collection('orders').find({ paid: true, served: false }).sort({ completedAt: 1 }).toArray();

      // 2) 모든 메뉴 가져와서 manufacturing 맵 생성
      const allMenus = await db.collection('menus').find().toArray();
      const manuMap = allMenus.reduce((m, x) => {
        m[x._id.toString()] = x.manufacturing;
        return m;
      }, {});

      // 3) 주문 아이템마다 manufacturing 필드 붙여주기
      const serveOrders = serveOrdersRaw.map((o) => ({
        ...o,
        items: o.items.map((i) => ({
          ...i,
          manufacturing: manuMap[i.menuId.toString()] || false,
        })),
      }));

      const tableNum = await db.collection('tables').countDocuments();

      응답.render('admin/server', { unpaidOrders, serveOrders, tableNum });
    } catch (err) {
      console.error('🚨 /admin/server 조회 중 오류:', err);
      res.status(500).send('서버 오류');
    }
  });

  // 송금 확인 처리
  router.post('/server/confirm', async (요청, 응답) => {
    const id = new ObjectId(요청.query.id);
    await db.collection('orders').updateOne({ _id: id }, { $set: { paid: true, confirmedAt: new Date() } });
    // 1) 해당 주문 ID 방에 이벤트 발송
    io.to(요청.query.id).emit('orderConfirmed');
    응답.send('송금확인이 완료되었습니다.');
  });

  // 주문 취소 처리
  router.post('/server/delete', async (요청, 응답) => {
    const id = new ObjectId(요청.query.id);
    await db.collection('orders').deleteOne({ _id: id });
    응답.send('주문이 삭제되었습니다.');
  });

  // 서빙 완료 API (변경 없음)
  router.post('/server/serve-order', async (req, res) => {
    const { orderId } = req.body;
    await db.collection('orders').updateOne({ _id: new ObjectId(orderId) }, { $set: { served: true, servedAt: new Date() } });
    io.to(orderId).emit('orderServed', orderId);
    res.sendStatus(200);
  });

  // — 주방 페이지 —
  router.get('/kitchen', async (req, res) => {
    const orders = await db
      .collection('orders')
      .find({ paid: true, completed: false }) // 아직 요리 완료되지 않은 주문
      .toArray();

    // 제조 음식만 필터링
    const menus = await db.collection('menus').find({ manufacturing: true }).toArray();
    const manuIds = menus.map((m) => m._id.toString());
    const kitchenOrders = orders
      .map((o) => ({
        ...o,
        items: o.items.filter((i) => manuIds.includes(i.menuId.toString())),
      }))
      .filter((o) => o.items.length);
    res.render('admin/kitchen', { kitchenOrders });
  });

  // 개별 메뉴 “요리됨” 체크 API
  router.post('/kitchen/item-cooked', async (req, res) => {
    const { orderId, menuId } = req.body;
    await db
      .collection('orders')
      .updateOne({ _id: new ObjectId(orderId), 'items.menuId': new ObjectId(menuId) }, { $set: { 'items.$.cooked': true } });
    io.to(orderId).emit('itemCooked', { orderId, menuId });
    res.sendStatus(200);
  });

  router.post('/kitchen/item-uncook', async (req, res) => {
    const { orderId, menuId } = req.body;
    try {
      // 해당 메뉴의 cooked를 false로 되돌림
      await db
        .collection('orders')
        .updateOne({ _id: new ObjectId(orderId), 'items.menuId': new ObjectId(menuId) }, { $set: { 'items.$.cooked': false } });
      // 실시간으로 서버 페이지에 알림
      io.to(orderId).emit('itemUncooked', { orderId, menuId });
      return res.sendStatus(200);
    } catch (err) {
      console.error('❌ item-uncook 실패:', err);
      return res.status(500).send('서버 오류');
    }
  });

  // 전체 요리 완료(버튼) API
  router.post('/kitchen/complete-order', async (req, res) => {
    const { orderId } = req.body;
    await db
      .collection('orders')
      .updateOne({ _id: new ObjectId(orderId) }, { $set: { completed: true, completedAt: new Date(), 'items.$[].cooked': true } });
    io.to(orderId).emit('orderCooked', orderId);
    res.sendStatus(200);
  });
  return router;
};
