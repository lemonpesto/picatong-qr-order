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

app.post('/cart/add', async (요청, 응답) => {
  await db.collection('cart').insertOne({ menuId: 요청.query.menuid, menuName: 요청.body.name, price: 요청.body.price, qty: parseInt(요청.body.qty) });
  응답.send('메뉴의 수량을 변경했습니다.');
});

app.post('/cart/update', async (요청, 응답) => {
  await db.collection('cart').updateOne({ menuId: 요청.query.menuid }, { $set: { qty: parseInt(요청.body.qty) } });
  응답.send('메뉴의 수량을 변경했습니다.');
});

app.delete('/cart/delete', async (요청, 응답) => {
  await db.collection('cart').deleteOne({ menuId: 요청.query.menuid });
  응답.send('메뉴를 삭제했습니다.');
});

app.get('/cart', async (요청, 응답) => {
  try {
    let result = await db.collection('menus').find().toArray();
    console.log('menus:', result);
    응답.render('menu.ejs', { menus: result });
  } catch (e) {
    console.error(e);
    응답.status(500).send('서버 오류');
  }
});

app.get('/order-detail/:id', async (요청, 응답) => {
  try {
    let result = await db.collection('orders').findOne({ tableId: new ObjectId(요청.params.id) });
    응답.render('order-detail.ejs', { orders: result });
  } catch {
    응답.status(404).send('이상한 url 입력함');
  }
});
// ------ 관리자 페이지 ------ //
app.use('/admin', require('./routes/admin.js'));
