
const input = require("readline-sync");
function HUD() {
  console.log("--------------------------------------------------------------\nLocation:",Location,);
  console.log(" Name:",Character1.Name,"\n","Health:",Character1.HP,"\n","Race:",Character1.Race,"\n","Class:",Character1.Class,"\n--------------------------------------------------------------");
}
let Start = [""];
let Races = ["Human"];
let Classes = ["Warrior", "Mage","Thief","Bard"]
let Location = ["Town"];
let Character1 = {
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 1,
  Strength: 1,
  MaxHP: 100,
  Progress: 0,
};
let Monster1 = {
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  Strength: 1,
  MonsterHP: 30,
  MonsterLevel: Character1.Level,
  MonsterXp: 5
};
console.log("yawp what if i want it to do a bunch of lines of code will it go to the next line if i keep typing txt here?\n");
Character1.Name = input.question("Please enter your name... \n\n");

console.log("Characters name is", Character1.Name,"\n\n");


  console.log("Please Choose a Race\n");
for (i = 0; i < Races.length; i++) {
  console.log(Races[i]);
}
Character1.Race = input.question("\n");

console.log("Please Choose a Class\n");
for (i = 0; i < Classes.length; i++) {
  console.log(Classes[i]);
}
Character1.Class = input.question("\n");

Start = input.question("Would you like to Begin? (Y/N)\n");
if (Start = "Y") {
 HUD();

}
