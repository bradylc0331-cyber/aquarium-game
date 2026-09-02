// 產生組裝說明用的分步圖。
// 座標寫死成 check.sh 驗證過的數值（跟 interference.scad 同樣的理由：
// include 會把被含檔的 part="assembly" 帶進來蓋掉 -D）。
//   用法：見 render-steps.sh
use <camera-stand.scad>

step = "parts";

Z_M1 = 6; Z_M2 = 229; Z_M3 = 452;    // 三節立柱的底部高度
Z_ARM = 478.5;                        // 臂底面
CR_Y = -150; CR_Z = 454.5;            // 托架原點
LENS_Z = 457;

module camera_body() {
    translate([17, CR_Y, LENS_Z]) linear_extrude(17)
        hull() { translate([-19,0]) circle(d=32); translate([19,0]) circle(d=32); }
}
module paper() { translate([-148.5, -255, -1]) cube([297, 210, 1]); }

module s_foot()   { color("dimgray") foot(); }
module s_mast1()  { color("steelblue") translate([0,0,Z_M1]) mast_segment(220); }
module s_mast2()  { color("steelblue") translate([0,0,Z_M2]) mast_segment(220); }
module s_mast3()  { color("steelblue") translate([0,0,Z_M3]) mast_segment(120); }
module s_arm()    { color("orange") translate([0,0,Z_ARM]) arm(); }
module s_cradle() { color("seagreen") translate([0,CR_Y,CR_Z]) cradle(); }
module s_cam()    { color("#333") camera_body(); }

if (step == "parts") {
    // 全部零件攤平排一排，用來對照清單
    color("dimgray")   translate([   0,   0, 0]) foot();
    color("steelblue") translate([ 200, -60, 0]) rotate([-90,0,0]) mast_segment(220);
    color("steelblue") translate([ 250, -60, 0]) rotate([-90,0,0]) mast_segment(220);
    color("skyblue")   translate([ 300, -60, 0]) rotate([-90,0,0]) mast_segment(120);
    color("mediumpurple") translate([350, -40, 0]) rotate([-90,0,0]) plug();
    color("mediumpurple") translate([395, -40, 0]) rotate([-90,0,0]) plug();
    color("orange")    translate([ 480,  20, 0]) arm();
    color("seagreen")  translate([ 560, -60, 0]) cradle();
    color("gold")      translate([ 640, -60, 0]) knob();
    color("gold")      translate([ 675, -60, 0]) knob();
    color("gold")      translate([ 640, -25, 0]) knob();
    color("gold")      translate([ 675, -25, 0]) knob();
}
else if (step == "foot_mast") { s_foot(); s_mast1(); }
else if (step == "mast_full") { s_foot(); s_mast1(); s_mast2(); s_mast3(); }
else if (step == "with_arm")  { s_foot(); s_mast1(); s_mast2(); s_mast3(); s_arm(); }
else if (step == "with_cradle") { s_foot(); s_mast1(); s_mast2(); s_mast3(); s_arm(); s_cradle(); }
else if (step == "done") {
    s_foot(); s_mast1(); s_mast2(); s_mast3(); s_arm(); s_cradle(); s_cam();
    color("white") paper();
}
else if (step == "head") { s_arm(); s_cradle(); s_cam(); }
else if (step == "joint") {
    // 接頭怎麼插：下管、接頭、上管拉開
    color("steelblue")    translate([0,0,0])   mast_segment(90);
    color("mediumpurple") translate([0,0,105]) plug();
    color("steelblue")    translate([0,0,230]) mast_segment(90);
}
