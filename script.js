let menu = document.querySelector('#menu-bar');
let navbar = document.querySelector('.navbar');
let modal = document.getElementById('authModal');
let loginBtn = document.getElementById('loginBtn');
let closeBtn = document.getElementsByClassName('close')[0];
let authTabs = document.getElementsByClassName('auth-tab');
let authForms = document.getElementsByClassName('auth-form');

menu.onclick = () => {
  menu.classList.toggle('fa-times');
  navbar.classList.toggle('active');
}

loginBtn.onclick = () => {
  modal.style.display = "block";
}

closeBtn.onclick = () => {
  modal.style.display = "none";
}

window.onclick = (event) => {
  if (event.target == modal) {
    modal.style.display = "none";
  }
}

for (let i = 0; i < authTabs.length; i++) {
  authTabs[i].addEventListener('click', function() {
    for (let j = 0; j < authTabs.length; j++) {
      authTabs[j].classList.remove('active');
      authForms[j].classList.remove('active');
    }
    this.classList.add('active');
    let tabName = this.getAttribute('data-tab');
    document.getElementById(tabName + 'Form').classList.add('active');
  });
}

document.getElementById('loginForm').onsubmit = (e) => {
  e.preventDefault();
  console.log('Login submitted');
}

document.getElementById('registerForm').onsubmit = (e) => {
  e.preventDefault();
  console.log('Registration submitted');
}

window.onscroll = () => {
  menu.classList.remove('fa-times');
  navbar.classList.remove('active');
  if (window.scrollY > 60) {
    document.querySelector('#scroll-top').classList.add('active');
  } else {
    document.querySelector('#scroll-top').classList.remove('active');
  }
}

function loader() {
  document.querySelector('.loader-container').classList.add('fade-out');
}

function fadeOut() {
  setInterval(loader, 3000);
}

window.onload = fadeOut();
