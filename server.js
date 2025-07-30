const express = require('express');
const app = express();
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

app.use(express.static(__dirname + '/public'));

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const MongoStore = require('connect-mongo');

app.use(passport.initialize());
app.use(
  session({
    secret: '암호화에 쓸 비번',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 2 * 60 * 60 * 1000 },
    store: MongoStore.create({
      mongoUrl: process.env.DB_URL,
      dbName: 'picatong-qr-order',
    }),
  })
);
app.use(passport.session());

const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = new S3Client({
  region: 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'lemonpesto-qrorder',
    key: function (요청, file, cb) {
      cb(null, Date.now().toString()); //업로드시 파일명 변경가능
    },
  }),
});

let connectDB = require('./database.js');

let db;
connectDB
  .then((client) => {
    console.log('DB연결성공');
    db = client.db('picatong-qr-order');
    app.listen(process.env.PORT, () => {
      console.log('listening on ' + process.env.PORT);
    });
  })
  .catch((err) => {
    console.log(err);
  });

passport.use(
  new LocalStrategy({ usernameField: 'tableNum', passwordField: 'accessKey' }, async (tableNum, accessKey, done) => {
    try {
      const table = await db.collection('tables').findOne({ tableNum: parseInt(tableNum), accessKey: accessKey });
      if (!table) return done(null, false, { message: 'Invalid Table' });
      return done(null, table);
    } catch (e) {
      return done(e);
    }
  })
);

passport.serializeUser((table, done) => {
  process.nextTick(() => {
    done(null, { id: table._id, tableNum: table.tableNum });
  });
});

passport.deserializeUser(async (table, done) => {
  let result = await db.collection('tables').findOne({ _id: new ObjectId(table.id) });
  delete result.accessKey, result.isActive;
  process.nextTick(() => {
    done(null, result);
  });
});

app.get('/login', async (요청, 응답, next) => {
  const { table, key } = 요청.query; // QR을 통해 /login?table=4&key=abc123 접속할 것.
  passport.authenticate('local', (err, user, info) => {
    if (err) return 응답.status(500).json(err);
    if (!user) return 응답.status(401).json(info.message);
    요청.logIn(user, (err) => {
      if (err) return next(err);
      응답.redirect('/menu');
    });
  })({ body: { tableNum: table, accessKey: key } }, 응답, next);
});

function checkLogin(요청, 응답, next) {
  if (!요청.user) {
    return 응답.send('다시 QR을 찍어주세요.');
  }
  next();
}
app.use(checkLogin);

// app.get('/', async (요청, 응답) => {
//   let result = await db.collection('menus').find().toArray();
//   응답.render('menu.ejs', { 메뉴목록: result });
// });

app.get('/menu', async (요청, 응답) => {
  try {
    let menus = await db.collection('menus').find().toArray();
    let categories = await db.collection('categories').find().sort({ order: 1 }).toArray();
    응답.render('menu.ejs', { menus, categories });
  } catch (e) {
    console.error(e);
    응답.status(500).send('서버 오류');
  }
});

// 메뉴 페이지
app.post('/cart/add', async (요청, 응답) => {
  const tableId = 요청.user._id; // 세션에서 tableId 추출
  const menuId = 요청.query.menuid;
  const { name, price, qty } = 요청.body;

  let result = await db.collection('cart').findOne({ tableId: tableId, menuId: new ObjectId(menuId) });
  if (result) {
    // 이미 담은 메뉴라면
    let totalQty = result['qty'] + parseInt(qty);
    await db.collection('cart').updateOne({ tableId: tableId, menuId: new ObjectId(menuId) }, { $set: { qty: totalQty } });
  } else {
    await db.collection('cart').insertOne({
      tableId: new ObjectId(tableId),
      menuId: new ObjectId(menuId),
      menuName: name,
      price: parseInt(price),
      qty: parseInt(qty),
    });
  }
  응답.send('메뉴를 추가했습니다.');
});

app.get('/cart/summary', async (요청, 응답) => {
  const tableId = 요청.user._id;

  const items = await db
    .collection('cart')
    .find({ tableId: new ObjectId(tableId) })
    .toArray();

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const count = items.reduce((sum, item) => sum + item.qty, 0);

  응답.json({ total, count });
});

// 장바구니 보기 페이지
app.get('/cart', async (요청, 응답) => {
  const tableId = 요청.user._id;
  try {
    let result = await db
      .collection('cart')
      .find({ tableId: new ObjectId(tableId) })
      .toArray();
    응답.render('cart.ejs', { menus: result });
  } catch (e) {
    console.error(e);
    응답.status(500).send('서버 오류');
  }
});

app.post('/cart/update', async (요청, 응답) => {
  const menuId = 요청.query.menuid;
  const qty = parseInt(요청.body.qty);
  const tableId = 요청.user._id;

  console.log('🔥 /cart/update 요청 도달'); // 반드시 출력돼야 함
  console.log('menuId:', menuId);
  console.log('tableId:', tableId, 'typeof:', typeof tableId);
  console.log('qty:', qty);

  let tmp = await db.collection('cart').findOne({ tableId: tableId });
  console.log('[Menu ID] actual: ', menuId, 'expected: ', tmp.menuId);

  const result = await db.collection('cart').updateOne({ tableId: tableId, menuId: new ObjectId(menuId) }, { $set: { qty: qty } });

  if (result.modifiedCount === 0) {
    응답.status(404).send('해당 항목을 찾을 수 없습니다.');
  } else {
    응답.send('메뉴의 수량을 변경했습니다.');
  }
});

app.delete('/cart/delete', async (요청, 응답) => {
  const menuId = 요청.query.menuid;
  const tableId = 요청.user._id;

  console.log('[DELETE] menuId:', menuId);

  const result = await db.collection('cart').deleteOne({
    tableId: new ObjectId(tableId),
    menuId: new ObjectId(menuId),
  });

  if (result.deletedCount === 0) {
    응답.status(404).send('삭제할 항목이 없습니다.');
  } else {
    응답.send('메뉴를 삭제했습니다.');
  }
});

// 결제 페이지
app.get('/payment', async (요청, 응답) => {
  try {
    const tableId = 요청.user._id; // 현재 사용자의 tableId

    // 장바구니의 총합 계산
    const cartItems = await db
      .collection('cart')
      .find({ tableId: new ObjectId(tableId) })
      .toArray();

    const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);

    응답.render('payment.ejs', { total });
  } catch (err) {
    console.error('💥 결제 페이지 오류:', err);
    응답.status(500).send('결제 페이지를 불러오지 못했습니다.');
  }
});

// 결제 확인 페이지
app.post('/payment/confirm', async (요청, 응답) => {
  try {
    // 유저 장바구니에서 항목 가져오기
    const cartItems = await db.collection('cart').find({ tableId: 요청.user._id }).toArray();
    if (cartItems.length === 0) {
      return 응답.status(400).send('장바구니가 비어 있습니다.');
    }
    // 총 금액 계산
    const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    // 주문 데이터 구성
    const orderDoc = {
      // 기본 주문 정보
      tableNum: 요청.user.tableNum,
      items: cartItems.map((item) => ({
        menuId: item.menuId,
        menuName: item.menuName,
        price: item.price,
        qty: item.qty,
      })),
      total,

      // 상태 정보
      paid: false,
      completed: false,
      served: false,

      // 시간 정보
      requestedAt: new Date(), // 유저가 "송금했습니다" 버튼을 누른 시각
      confirmedAt: null, // 서버가 송금 확인을 누른 시각
      completedAt: null, // 주방에서 요리 완료 누른 시각
      servedAt: null, // 서버가 서빙 완료 누른 시각
    };

    // 주문 저장
    const result = await db.collection('orders').insertOne(orderDoc);

    // 장바구니 비우기
    await db.collection('cart').deleteMany({ tableId: 요청.user._id });

    응답.redirect(`/payment/confirm?orderId=${result._id}`);
  } catch (err) {
    console.error('❌ 주문 저장 실패:', err);
    응답.status(500).send('서버 오류로 주문을 저장하지 못했습니다.');
  }
});

// 결제 확인 페이지
app.get('/payment/confirm', async (요청, 응답) => {
  try {
    응답.render('confirm.ejs');
  } catch (err) {
    console.error('💥 /payment/confirm 오류:', err);
    응답.status(500).send('확인 페이지를 불러오는 중 오류가 발생했습니다.');
  }
});

// 주문 내역 페이지
app.get('/orders/history', async (요청, 응답) => {
  const tableId = 요청.user._id;
  try {
    let result = await db.collection('orders').find({ tableId: new ObjectId(tableId) });
    console.log(result);
    응답.render('orders-history.ejs', { orders: result });
  } catch {
    응답.status(404).send('이상한 url 입력함');
  }
});
// ------ 관리자 페이지 ------ //
app.use('/admin', require('./routes/admin.js'));
