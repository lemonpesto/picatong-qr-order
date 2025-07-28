function closeBottomSheet() {
  document.getElementById('bottom-sheet').classList.remove('show');
  document.getElementById('bottom-sheet').classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
}

function updateAddToCartButton(qty) {
  const total = currPrice * qty;
  const button = document.getElementById('add-to-cart');
  button.textContent = `${total.toLocaleString()}원 장바구니에 담기`;
}

document.querySelectorAll('.list-box').forEach((item) => {
  item.addEventListener('click', () => {
    const name = item.dataset.name;
    const price = parseInt(item.dataset.price);
    const menuId = item.dataset.menuid;

    currPrice = price; // 현재 메뉴 단가 기억
    currMenuId = menuId;

    // 바텀 시트 요소들 설정
    document.getElementById('sheet-name').textContent = name;
    document.getElementById('qty').textContent = '1';
    document.getElementById('sheet-price').textContent = price.toLocaleString() + '원';
    document.getElementById('minus').disabled = true; // 초기 수량 1이므로 - 버튼 비활성화

    // 장바구니 버튼 텍스트 초기화
    updateAddToCartButton(1);

    // 바텀 시트, 오버레이 보이기
    document.getElementById('bottom-sheet').classList.remove('hidden');
    document.getElementById('bottom-sheet').classList.add('show');
    document.getElementById('overlay').classList.remove('hidden');
  });
});

document.getElementById('plus').addEventListener('click', () => {
  let qty = parseInt(document.getElementById('qty').textContent);
  document.getElementById('qty').textContent = ++qty;
  document.getElementById('minus').disabled = qty === 1;
  updateAddToCartButton(qty);
});

document.getElementById('minus').addEventListener('click', () => {
  let qty = parseInt(document.getElementById('qty').textContent);
  if (qty > 1) {
    document.getElementById('qty').textContent = --qty;
    document.getElementById('minus').disabled = qty === 1;
    updateAddToCartButton(qty);
  }
});

document.getElementById('add-to-cart').addEventListener('click', async () => {
  const name = document.getElementById('sheet-name').textContent;
  const qty = document.getElementById('qty').textContent;
  try {
    const res = await fetch('/cart/add?menuid=' + currMenuId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        price: currPrice,
        qty,
      }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error('서버 오류: ' + msg);
    }
    await updateCartButton();

    const msg = await res.text();
    alert(msg); // 예: "메뉴를 추가했습니다."
  } catch (err) {
    console.error('장바구니 담기 실패:', err);
    alert('문제가 발생했어요 😢');
  }

  // 바텀 시트 닫기
  closeBottomSheet();
});

document.getElementById('close-sheet').addEventListener('click', closeBottomSheet);

document.getElementById('overlay').addEventListener('click', closeBottomSheet);
