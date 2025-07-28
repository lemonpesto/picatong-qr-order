async function updateInfo() {
  try {
    const res = await fetch('/cart/summary');
    const data = await res.json(); // { total: 12000, count: 3 }

    // 안내 문구
    const totalQtySpan = document.querySelector('.total-qty');
    totalQtySpan.textContent = `선택한 ${data.count}개 메뉴를 확인해주세요!`;

    // 주문 버튼
    const orderBtn = document.getElementById('order');
    if (data.count > 0) {
      orderBtn.textContent = `총 ${data.total.toLocaleString()}원 주문하기 (${data.count})`;
      orderBtn.classList.remove('hidden');
    } else {
      orderBtn.classList.add('hidden');
      totalQtySpan.textContent = '장바구니가 비어 있습니다';
    }
  } catch (err) {
    console.error('장바구니 요약 정보 실패:', err);
  }
}

// 초기 실행
updateInfo();

console.log('✅ cart.js 로딩됨');

// 메뉴별 수량 조정
document.querySelectorAll('.list-box').forEach((item) => {
  const minusBtn = item.querySelector('.minus');
  const plusBtn = item.querySelector('.plus');
  const trashIcon = minusBtn.querySelector('.fa-trash');
  const minusText = minusBtn.querySelector('.minus-text');
  const qtyEl = item.querySelector('.qty');
  const menuId = item.dataset.menuid;

  let qty = parseInt(qtyEl.textContent);

  function updateUI() {
    qtyEl.textContent = qty;
    if (qty === 1) {
      trashIcon.style.display = 'inline';
      minusText.style.display = 'none';
    } else {
      trashIcon.style.display = 'none';
      minusText.style.display = 'inline';
    }
  }

  minusBtn.addEventListener('click', async () => {
    console.log('🧪 minus 클릭됨', qty); // ✅ 디버깅 로그 추가
    if (qty === 1) {
      console.log('🗑️ delete 요청 전송 중...'); // ✅
      const res = await fetch('/cart/delete?menuid=' + menuId, { method: 'DELETE', credentials: 'include' });
      const msg = await res.text(); // ✅ 여기서만 text() 사용
      item.style.display = 'none';
      alert(msg);
      updateInfo();
    } else {
      qty--;
      updateUI();
      console.log('📝 update 요청 전송 중...', qty); // ✅
      const res = await fetch('/cart/update?menuid=' + menuId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ qty }),
      });
      const msg = await res.text();
      alert(msg); // 예: "메뉴의 수량을 변경했습니다"
      updateInfo();
    }
  });

  plusBtn.addEventListener('click', async () => {
    qty++;
    updateUI();
    const res = await fetch('/cart/update?menuid=' + menuId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ qty }),
    });
    const msg = await res.text();
    alert(msg); // 예: "메뉴의 수량을 변경했습니다"
    updateInfo();
  });

  updateUI(); // 처음에 버튼 아이콘 세팅
});
