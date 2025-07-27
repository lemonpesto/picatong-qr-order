async function updateCartButton() {
  try {
    const res = await fetch('/cart/summary');
    const data = await res.json(); // { total: 12000, count: 3 }

    const viewCart = document.getElementById('view-cart');
    if (data.count > 0) {
      viewCart.textContent = `총 ${data.total.toLocaleString()}원 장바구니 보기 (${data.count})`;
      viewCart.classList.remove('hidden');
    } else {
      viewCart.classList.add('hidden');
    }
  } catch (err) {
    console.error('장바구니 정보 가져오기 실패:', err);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateCartButton();
});
