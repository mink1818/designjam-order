(() => {
  'use strict';
  function bind() {
    document.querySelectorAll('[data-customer-back]').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      history.back();
    }));
    document.querySelectorAll('[data-customer-forward]').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      history.forward();
    }));
    document.querySelectorAll('[data-customer-cart]').forEach(link => link.addEventListener('click', event => {
      if (typeof window.handleCustomerCartNav === 'function' && window.handleCustomerCartNav()) event.preventDefault();
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
