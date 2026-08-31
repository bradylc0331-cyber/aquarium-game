use <camera-stand.scad>
test = "none";
ARM_Z = 478.5; CR_Y = -150; CR_Z = 454.5; LENS_Z = 457;
module camera_body(dz = 0) {
    translate([17, CR_Y, LENS_Z + dz]) linear_extrude(17)
        hull() { translate([-19,0]) circle(d=32); translate([19,0]) circle(d=32); }
}
module the_arm()    { translate([0,0,ARM_Z]) arm(); }
module the_cradle() { translate([0, CR_Y, CR_Z]) cradle(); }
module the_mast()   { translate([0,0,6]) linear_extrude(600) square(35, center=true); }
if      (test=="sanity_cam")     camera_body();
else if (test=="cam_vs_arm")     intersection() { camera_body();  the_arm(); }
else if (test=="cam_vs_mast")    intersection() { camera_body();  the_mast(); }
else if (test=="cam_seated")     intersection() { camera_body();  the_cradle(); }
else if (test=="lip_catches")    intersection() { camera_body(-1); the_cradle(); }
else if (test=="cradle_vs_arm")  intersection() { the_cradle();   the_arm(); }
else if (test=="cradle_vs_mast") intersection() { the_cradle();   the_mast(); }
else if (test=="arm_vs_foot")    intersection() { the_arm();      foot(); }
// 確認 cradle_vs_arm 那 1 面是「剛好貼平」的退化輸出，不是真的吃進去：
// 往外挪 0.1 應該完全分開；往內壓 0.5 應該明顯咬進去。
module cradle_off(dx) { translate([dx, CR_Y, CR_Z]) cradle(); }
if (test=="gap_plus")  intersection() { cradle_off(-0.1); the_arm(); }
if (test=="gap_minus") intersection() { cradle_off( 0.5); the_arm(); }
