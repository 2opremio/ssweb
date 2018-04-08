import './main.css';

import('./lib/shader').then(function(result) {
  var init = result.default;
  init();
});
