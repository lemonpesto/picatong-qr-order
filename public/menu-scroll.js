document.addEventListener('DOMContentLoaded', () => {
  const categoryBar = document.querySelector('.category-bar');
  const buttons = document.querySelectorAll('.category-button');
  const sections = document.querySelectorAll('.menu-section');

  // 버튼 클릭 시 해당 섹션으로 스크롤
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        // offsetTop에서 sticky된 categoryBar 높이만큼 보정
        const yOffset = -categoryBar.offsetHeight;
        const y = targetSection.getBoundingClientRect().top + window.pageYOffset + yOffset;

        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  });

  // 스크롤 시 현재 보이는 섹션에 해당하는 버튼에 active 클래스 부여
  window.addEventListener('scroll', () => {
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
      if (btn.dataset.target === currentSectionId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  });
});
