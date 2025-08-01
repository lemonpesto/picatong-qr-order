document.addEventListener('DOMContentLoaded', () => {
  const categoryBar = document.querySelector('.category-bar');
  const buttons = document.querySelectorAll('.category-button');
  const sections = document.querySelectorAll('.menu-section');

  let autoScrollInProgress = false;
  let autoScrollTimeout;

  // 1) 버튼 클릭 → 즉시 active 설정 & 자동 스크롤 플래그 토글
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // (a) 클릭 즉시 active
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // (b) 자동 스크롤 시작
      const targetId = btn.dataset.target;
      const targetSection = document.getElementById(targetId);
      if (!targetSection) return;

      const yOffset = -categoryBar.offsetHeight - 50;
      const y = targetSection.getBoundingClientRect().top + window.pageYOffset + yOffset;

      // 플래그 올리고, 이전 타이머 지운 뒤 스크롤
      autoScrollInProgress = true;
      clearTimeout(autoScrollTimeout);
      window.scrollTo({ top: y, behavior: 'smooth' });

      // 500ms 후 자동 스크롤 끝난 걸로 간주
      autoScrollTimeout = setTimeout(() => {
        autoScrollInProgress = false;
      }, 500);
    });
  });

  // 2) 스크롤 감지 → 자동 스크롤 중이면 무시, 아니면 섹션 기준 active 토글
  window.addEventListener('scroll', () => {
    if (autoScrollInProgress) return;

    let currentSectionId = '';
    const scrollY = window.scrollY;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop - categoryBar.offsetHeight - 10;
      const sectionBottom = sectionTop + section.offsetHeight;
      if (scrollY >= sectionTop && scrollY < sectionBottom) {
        currentSectionId = section.id;
      }
    });

    buttons.forEach((btn) => {
      btn.dataset.target === currentSectionId ? btn.classList.add('active') : btn.classList.remove('active');
    });
  });
});
