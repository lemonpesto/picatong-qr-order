document.querySelectorAll('.list-box').forEach((item) => {
  item.addEventListener('click', () => {
    const name = item.dataset.name;
    const price = item.dataset.price;

    document.getElementById('sheet-name').textContent = name;
    document.getElementById('qty').textContent = '1';
    document.getElementById('bottom-sheet').classList.remove('hidden');
    document.getElementById('bottom-sheet').classList.add('show');
  });
});

document.getElementById('close-sheet').addEventListener('click', () => {
  document.getElementById('bottom-sheet').classList.remove('show');
  document.getElementById('bottom-sheet').classList.add('hidden');
});

document.getElementById('plus').addEventListener('click', () => {
  let qty = parseInt(document.getElementById('qty').textContent);
  document.getElementById('qty').textContent = qty + 1;
});

document.getElementById('minus').addEventListener('click', () => {
  let qty = parseInt(document.getElementById('qty').textContent);
  if (qty > 1) document.getElementById('qty').textContent = qty - 1;
});

document.getElementById('add-to-cart').addEventListener('click', () => {
  const name = document.getElementById('sheet-name').textContent;
  const qty = document.getElementById('qty').textContent;
  alert(`${name} ${qty}개 장바구니에 담겼습니다 (장바구니 기능은 아직 미구현)`);

  // 나중에 ajax로 장바구니에 담기 구현할 부분
  document.getElementById('bottom-sheet').classList.remove('show');
  document.getElementById('bottom-sheet').classList.add('hidden');
});
