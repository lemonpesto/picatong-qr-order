function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

async function updateInfo() {
  try {
    const res = await fetch('/cart/summary');
    if (!res.ok) {
      console.error('요약 정보 요청 실패:', res.status);
      throw new Error('네트워크 응답이 정상이 아닙니다');
    }
    const data = await res.json();
    // 안전하게 기본값 설정
    const total = (typeof data.total === 'number' ? data.total : 0);
    const count = (typeof data.count === 'number' ? data.count : 0);


    // 빈 장바구니 섹션
    const noticeSection = document.querySelector('.notice-bar');

    // 채워진 장바구니 섹션
    const cartSection = document.querySelector('.cart-section');
    const secDiv = document.querySelector('.section-divider');
    const totalQtySpan = document.querySelector('.total-qty');
    totalQtySpan.innerHTML = `선택한 메뉴 <span class="highlight">${data.count}</span>개`;
    const orderBtn = document.getElementById('order');

    if (data.count > 0) {
      orderBtn.innerHTML = `총 ${data.total.toLocaleString()}</span>원 주문하기 (${data.count})`;
      cartSection.classList.remove('hidden');
      secDiv.classList.remove('hidden');
      orderBtn.classList.remove('hidden');
      noticeSection.style.display = 'none';
    } else {
      cartSection.classList.add('hidden');
      secDiv.classList.add('hidden');
      orderBtn.classList.add('hidden');
      noticeSection.style.display = 'flex';
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
  const trashIcon = minusBtn.querySelector('.fa-trash-can');
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
      showToast(msg);
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
      showToast(msg); // 예: "메뉴의 수량을 변경했습니다"
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
    showToast(msg); // 예: "메뉴의 수량을 변경했습니다"
    updateInfo();
  });

  updateUI(); // 처음에 버튼 아이콘 세팅
});
