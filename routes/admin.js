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

  // 메뉴 관리
  router.get('/menu', async (요청, 응답) => {
    try {
      const menus = await db.collection('menus').find().toArray();
      const categories = await db.collection('categories').find().toArray();
      응답.render('admin/menu', {
        menus,
        categories,
        pageTitle: '메뉴관리',
      });
    } catch (e) {
      console.error(e);
      응답.status(500).send('서버 오류');
    }
  });

  router.post('/menu', async (요청, 응답) => {
    try {
      const { name, price, category, description, isActive } = 요청.body;
      if (!name || !price) {
        return 응답.status(400).send('모든 항목을 입력해야 합니다.');
      }
      // 카테고리 문서에서 manufacturing 불러오기
      const catDoc = await db.collection('categories').findOne({ name: category });
      const manufacturing = catDoc ? catDoc.manufacturing : '';

      await db.collection('menus').insertOne({
        name,
        price: parseInt(price),
        category,
        description,
        isActive: isActive === 'true',
        manufacturing,
      });
      응답.status(201).send();
    } catch (e) {
      console.error(e);
      응답.status(500).send('서버 에러');
    }
  });

  // 메뉴 삭제
  router.delete('/menu', async (req, res) => {
    try {
      const { id } = req.query;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send('유효하지 않은 ID');
      }
      await db.collection('menus').deleteOne({ _id: new ObjectId(id) });
      res.send('삭제되었습니다.');
    } catch (e) {
      console.error(e);
      res.status(500).send('서버 에러');
    }
  });

  // 메뉴 수정
  router.put('/menu', async (req, res) => {
    try {
      const { id } = req.query;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send('유효하지 않은 ID');
      }
      const { name, price, category, status } = req.body;
      const updateDoc = {
        name,
        price: parseInt(price),
        category,
        description,
        status: status === 'true',
      };
      // 변경된 카테고리에 맞게 manufacturing 업데이트
      const catDoc = await db.collection('categories').findOne({ name: category });
      if (catDoc) updateDoc.manufacturing = catDoc.manufacturing;

      await db.collection('menus').updateOne({ _id: new ObjectId(id) }, { $set: updateDoc });
      res.send('수정되었습니다.');
    } catch (e) {
      console.error(e);
      res.status(500).send('서버 에러');
    }
  });

  // (2) 카테고리 생성
  router.post('/category', async (req, res) => {
    const { name, manufacturing } = req.body;
    if (!name || !manufacturing) {
      return res.status(400).send('모든 필드를 입력하세요.');
    }
    // 현재 가장 큰 order 값 찾기
    const last = await db.collection('categories').find().sort({ order: -1 }).limit(1).toArray();
    const nextOrder = last[0] ? last[0].order + 1 : 0;
    await db.collection('categories').insertOne({ name, manufacturing, order: nextOrder });
    res.status(201).send();
  });

  // (3) 카테고리 순서 변경
  router.put('/category/order:id', async (req, res) => {
    const { id } = req.params;
    const { direction } = req.body; // -1 이면 위로, +1 이면 아래로
    if (!ObjectId.isValid(id)) return res.status(400).send('잘못된 ID');

    const cat = await db.collection('categories').findOne({ _id: new ObjectId(id) });
    if (!cat) return res.status(404).send('카테고리 없음');

    // 교환 대상 찾기
    const swap = await db.collection('categories').findOne({ order: cat.order + direction });
    if (!swap) return res.status(400).send('더 이동할 수 없습니다.');

    // 두 문서의 order 값 스왑
    await db.collection('categories').updateOne({ _id: cat._id }, { $set: { order: swap.order } });
    await db.collection('categories').updateOne({ _id: swap._id }, { $set: { order: cat.order } });
    res.send('순서가 변경되었습니다.');
  });

  // (4) 카테고리 삭제
  router.delete('/category/:id', async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).send('잘못된 ID');
    await db.collection('categories').deleteOne({ _id: new ObjectId(id) });
    res.send('삭제되었습니다.');
  });

  // (5) 카테고리 순서 일괄 업데이트
  router.put('/category/order', async (req, res) => {
    const { order } = req.body; // [id1, id2, ...]
    if (!Array.isArray(order)) return res.status(400).send('잘못된 요청');
    const ops = order.map((id, idx) => ({
      updateOne: {
        filter: { _id: new ObjectId(id) },
        update: { $set: { order: idx } },
      },
    }));
    await db.collection('categories').bulkWrite(ops);
    res.send('순서가 저장되었습니다.');
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

      응답.render('admin/server', { unpaidOrders, serveOrders, tableNum, pageTitle: '서버' });
    } catch (err) {
      console.error('🚨 /admin/server 조회 중 오류:', err);
      res.status(500).send('서버 오류');
    }
  });

  // 송금 확인 처리
  router.post('/server/confirm', async (요청, 응답) => {
    const id = new ObjectId(요청.query.id);
    await db.collection('orders').updateOne({ _id: id }, { $set: { paid: true, confirmedAt: new Date() } });
    // 고객 confirm 페이지 알림
    io.to(요청.query.id).emit('orderConfirmed');

    // 서빙 탭 실시간 업데이트용으로, 모든 관리자 클라이언트에 새 결제 완료 주문 푸시
    const paidOrder = await db.collection('orders').findOne({ _id: id });
    io.emit('orderPaid', paidOrder);

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
    res.render('admin/kitchen', { kitchenOrders, pageTitle: '주방' });
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
