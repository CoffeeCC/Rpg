
const input = require("readline-sync");
let MonsterNamesPRE = ["Gro","Zoo","Glo","Gru","Dro","Dre","Zar","Klo","Gre","Spoo","Tre","Glar","Zar","Kar","Tar","Tu","Har",];
let MonsterNamesSUF = ["Gro","Zoo","Glo","Gru","Dro","Dre","Zar","Klo","Gre","Spoo","Tre","Glar","Zar","Kar","Tar","Tu","Har",];
function HUD() {
  console.log("--------------------------------------------------------------\nLocation:",Location,"Progress",Character1.Progress);
  console.log(" Name:",Character1.Name,"\n","Health:",Character1.HP,"\n","Race:",Character1.Race,"\n","Class:",Character1.Class,"\n--------------------------------------------------------------\n");
}

let Start = [""];
let ItemList = ["Green Herb","Red Herb","Yellow Herb",]
let Races = ["Human","Elf","Dwarf",""];
let Classes = ["Warrior", "Mage","Thief","Bard","Knight",]
let Location = ["Town"];
let Character1 = {
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 1,
  Strength: 1,
  MaxHP: 100,
  Progress: 1,
  Search: 1,
};
let Monster1 = {
  Name:  " ",
  Race:  " ",
  Class:  " ",
  Level:  1,
  HP: 0,
  Strength: 1,
  MaxHP: 100,
  Progress: 1,
  Search: 1,
};
CreateCharacter();
function CreateCharacter(){
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

Start = input.question("Does everything look correct? Would you like to Begin? (Y/N)\n");
if (Start = "Y") {
  console.clear();
  HUD();
  MOVING();
}
else {
  CreateCharacter();
}
};












////////////////////////Function Storage/////////////
function CombatHUD() {
  console.clear();
  CreateMonster();
  console.log("*****************************************************************************")
    console.log(Character1.Name,"HP",Character1.HP,"|", Monster1.Name,"HP",Monster1.MonsterHP,"Level:",Monster1.Level,);
  };
function CreateMonster() {
let R = Math.floor(Math.random() * 3);
Monster1.MonsterHP = Math.floor(Math.random() * 30) + Character1.Level,
Monster1.MaxHP = Monster1.MonsterHP,
Monster1.Level = (Math.floor(Math.random()* 5)) + Character1.Level,
Monster1.MonsterXP = (Monster1.MonsterHP/2),
Monster1.Name = MonsterNamesPRE[Math.floor(Math.random()*MonsterNamesPRE.length)] + "-" + MonsterNamesSUF[Math.floor(Math.random()*MonsterNamesSUF.length)]

if (Monster1.MonsterHP <= 10) {
  CreateMonster();
};
if (Monster1.MonsterLevel == 0) {
  CreateMonster();
};
};
function MOVING(){
  let EncounterChance = Math.floor(Math.random() * 10) + 1;
  let ItemChance = Math.floor (Math.random() * 10) + 1;
  let Choice;
  console.log("1. Move Forwards.\n");
  console.log("2. Rest.\n");
  console.log("3. Move Backwards.\n");
  console.log("4. Search\n");
  console.log("EncounterChance",EncounterChance,"ItemChance",ItemChance);
Choice = input.question("______________________________________________________________\n");
///Maybe use a switch for this?
  if (Choice == 1){
Character1.Progress++
Character1.Search++
if (EncounterChance >= 5) {
  //run create montser Function here

  console.clear();
  CreateMonster();
  CombatHUD();
}
else {
  HUD();
  MOVING();
}
  }
  if (Choice == 2) {
    //Rest and Gain Health,Day Progresses.
  }
  if (Choice == 3) {
Character1.Progress--
  }
  if (Choice == 4) {
    if (Character1.Search >= 1) {
    console.log("You Search the Area for Anything Useful\n");
    if (ItemChance > 6) {
      console.log("You found a",ItemList[Math.floor(Math.random()*ItemList.length)]);
    }
    Character1.Search--
    }
    else if (Character1.Search < 1) {
      console.log("You have Already Searched this area.\n.");
    }
    if (Character1.Progress = 2) {
  ///Run Event for Second Space
    }
    else {
      console.log("You dont see anything Interesting\n");
    }
    }
    };
  