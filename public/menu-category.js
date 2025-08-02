document.addEventListener("DOMContentLoaded", () => {
  const categoryBar = document.querySelector(".category-bar");
  const buttons = document.querySelectorAll(".category-button");
  const sections = document.querySelectorAll(".menu-section");

  let autoScrollInProgress = false;
  let autoScrollTimeout = null;

  // 클릭 이벤트
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      // 1. 클릭 즉시 active
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // 2. 자동 스크롤
      const targetId = btn.dataset.target;
      const targetSection = document.getElementById(targetId);
      if (!targetSection) return;

      const yOffset = -categoryBar.offsetHeight - 50;
      const y = targetSection.getBoundingClientRect().top + window.pageYOffset + yOffset;

      autoScrollInProgress = true;
      clearTimeout(autoScrollTimeout);
      window.scrollTo({ top: y, behavior: "smooth" });

      // 3. 자동 스크롤 종료 후에만, 스크롤 감지가 active 토글 가능
      autoScrollTimeout = setTimeout(() => {
        autoScrollInProgress = false;
      }, 700); // 700ms로 살짝 늘려서 "불안정" 느낌 없게!
    });
  });

  // 스크롤 이벤트 (버튼 루프 밖! 단 1회만)
  window.addEventListener("scroll", () => {
    // 1. 자동 스크롤 중엔 무시!
    if (autoScrollInProgress) return;

    let currentSectionId = "";
    const scrollY = window.scrollY;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop - categoryBar.offsetHeight - 10;
      const sectionBottom = sectionTop + section.offsetHeight;
      if (scrollY >= sectionTop && scrollY < sectionBottom) {
        currentSectionId = section.id;
      }
    });

    buttons.forEach((btn) => {
      if (btn.dataset.target === currentSectionId) btn.classList.add("active");
      else btn.classList.remove("active");
    });
  });
});
