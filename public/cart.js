// Toast 메시지
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

async function updateInfo() {
  try {
    const res = await fetch("/cart/summary");
    if (!res.ok) throw new Error("네트워크 응답이 정상이 아닙니다");
    const data = await res.json();

    const total = typeof data.total === "number" ? data.total : 0;
    const count = typeof data.count === "number" ? data.count : 0;

    const noticeSection = document.querySelector(".inline-action");
    const cartSection = document.querySelector(".cart-section");
    const secDiv = document.querySelector(".section-divider");
    const totalQtySpan = document.querySelector(".total-qty");
    const orderBtn = document.getElementById("order");

    totalQtySpan.innerHTML = `선택한 메뉴 <span class="highlight">${count}</span>개`;

    if (count > 0) {
      orderBtn.innerHTML = `총 ${total.toLocaleString()}원 주문하기 (${count})`;
      cartSection.classList.remove("hidden");
      secDiv.classList.remove("hidden");
      orderBtn.classList.remove("hidden");
      noticeSection.style.display = "none";
    } else {
      cartSection.classList.add("hidden");
      secDiv.classList.add("hidden");
      orderBtn.classList.add("hidden");
      noticeSection.style.display = "flex";
    }
  } catch (err) {
    console.error("장바구니 요약 정보 실패:", err);
  }
}

// 초기 정보 동기화
updateInfo();

// 메뉴별 수량 조정 및 삭제
document.querySelectorAll(".cart-items").forEach((item) => {
  const minusBtn = item.querySelector(".minus");
  const plusBtn = item.querySelector(".plus");
  const trashIcon = minusBtn.querySelector(".fa-trash-can");
  const minusText = minusBtn.querySelector(".minus-text");
  const qtyEl = item.querySelector(".qty");
  const menuId = item.dataset.menuid;
  const comment = item.dataset.comment || "";

  let qty = parseInt(qtyEl.textContent);

  function updateUI() {
    qtyEl.textContent = qty;
    trashIcon.style.display = qty === 1 ? "inline" : "none";
    minusText.style.display = qty === 1 ? "none" : "inline";
  }

  minusBtn.addEventListener("click", async () => {
    if (qty === 1) {
      const res = await fetch(`/cart/delete?menuid=${menuId}&comment=${encodeURIComponent(comment)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const msg = await res.text();

      // 아이템 list-box 삭제 시 divider 동시 제거
      const next = item.nextElementSibling;
      const prev = item.previousElementSibling;

      if (next && next.classList.contains("menu-divider")) {
        // 일반적인 경우: 바로 뒤가 divider
        next.remove();
      } else if (!next && prev && prev.classList.contains("menu-divider")) {
        // 마지막 list-box 삭제: 바로 앞이 divider
        prev.remove();
      }
      item.remove();

      showToast(msg);
      updateInfo();
    } else {
      qty--;
      updateUI();
      const res = await fetch(`/cart/update?menuid=${menuId}&comment=${encodeURIComponent(comment)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ qty }),
      });
      const msg = await res.text();
      showToast(msg);
      updateInfo();
    }
  });

  plusBtn.addEventListener("click", async () => {
    qty++;
    updateUI();
    const res = await fetch(`/cart/update?menuid=${menuId}&comment=${encodeURIComponent(comment)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ qty }),
    });
    const msg = await res.text();
    showToast(msg);
    updateInfo();
  });

  updateUI();
});
