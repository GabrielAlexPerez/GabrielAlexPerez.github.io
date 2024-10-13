var id = null;
var rockid = null;

function myMove() {

  // Counter Code
  var elem = document.getElementById("myCounter");
  var pos = 0
  clearInterval(id);
  id = setInterval(frame, 10);
  var num = 5;
  function frame() {
    if (num == 0) {
      elem.textContent = "Blast Off!";
      clearInterval(id);

      // Rocket Moving Code
      var rockelem = document.getElementById("myRocket");
      var imageElement = rockelem.querySelector("img");
      // Change the source of the image
      imageElement.src = "assets/img/LaunchRocket.png";


    } else {
      elem.textContent = num.toString();
      pos++;
      if (pos%100 == 0){
        num --;
      }
    }
  }


}
