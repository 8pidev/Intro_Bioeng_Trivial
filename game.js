const rollButton = document.querySelector("#roll-die");
const dieResult = document.querySelector("#die-result");

rollButton.addEventListener("click", () => {
  dieResult.value = String(Math.floor(Math.random() * 6) + 1);
});
