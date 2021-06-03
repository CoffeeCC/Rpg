
const input = require("readline-sync");
let Races = ["Human"];
let Classes = ["Warrior", "Mage","Thief","Bard"]
let Character1 = {
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 0,
};
let Monster1 = {
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
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
