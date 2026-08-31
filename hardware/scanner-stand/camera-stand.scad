// ============================================================================
// 聖經樂園 A4 塗色掃描台 —— 攝影機支架（獨立式）
//
// 用途：把 Logitech C270 架在桌面 A4 塗色紙的正上方，鏡頭垂直向下。
// 印表機：Bambu Lab A1（成型 256×256×256），噴頭 0.4 mm。
//
// 設計原則
//   1. 每個零件都免支撐。
//   2. 剛性優先於輕量 —— 晃動會讓每幀偵測到的角點跳動。
//   3. 反覆拆裝免工具（夾緊全部用印出來的旋鈕，自攻進塑膠，不必埋螺帽）。
//   4. 受力一定走機械結構，不走黏膠。
//
// 換攝影機或換印表機，只要動下面「可調參數」，不用碰後面的模型。單位一律 mm。
// ============================================================================

// ---------------------------------------------------------------------------
// 可調參數
// ---------------------------------------------------------------------------

// 要輸出哪一個零件（匯出 STL 時用 -D part="..." 覆寫）
part = "assembly";
// "foot" 底座 / "mast" 立柱節 / "mast_short" 加長節 / "plug" 接頭 /
// "arm" 套環＋前伸臂 / "cradle" 攝影機托架 / "knob" 旋鈕 /
// "gauge" 試裝規 / "assembly" 組合預覽

// --- 攝影機：Logitech C270 -------------------------------------------------
// 正面是膠囊形（stadium），兩端接近半圓 —— 不是圓角矩形。
cam_w      = 70;    // 正面長邊（實測 7 cm）
cam_h      = 32;    // 正面短邊。Logitech 規格 31.91、照片長寬比 2.2 反推 31.8。
                    // 這是唯一沒實測的尺寸，所以環故意做鬆（見 cam_fit）。
cam_thick  = 17;    // 機身最厚處（實測 1.7 cm）
cam_rim    = 12;    // 環抓住的外緣深度。背面是圓弧隆起，抓太深會頂到，只抓最外緣。
cam_lens_x = 18;    // 鏡頭中心離左端（實測 1.8 cm）。機身中心在 35，故鏡頭偏心 17。
cam_fit    = 1.5;   // 環內周刻意放鬆（單邊 0.75）。
                    // 間隙用泡棉雙面膠當墊片吃掉 —— 這樣 cam_h 猜 31 或 33 都裝得下。
                    // 重量不靠膠，靠環底那圈 lip 擋唇。

// --- 取景幾何 --------------------------------------------------------------
// 由 src/constants.js 與 C270 規格推出來（推導見 README.md）：
//   C270 是 55° 對角 + 16:9 → 水平 48.8°、垂直 28.6°。
//   卡住的是垂直方向：A4 橫式 210 mm 高要塞進 28.6°，
//   且 QR 區上緣離紙頂只有 3.0 mm，紙一被切到就讀不到 QR。
//   取「紙佔畫面高 90%」→ 鏡頭離紙面 457 mm，此時紙佔畫面寬 71.6%（在 70–85% 內）。
lens_height = 457;  // 設計工作點；實際靠套環上下無段微調
arm_reach   = 158;  // 立柱軸心到臂尖鎖點；鏡頭光軸落在往前 150 mm 處
                    // 150 = 立柱半寬 17.5 + 立柱到紙後緣 27.5 + 紙深一半 105

// --- 立柱 ------------------------------------------------------------------
mast        = 35;    // 方管外寬。方形斷面，套環才不會轉。
mast_wall   = 3;
mast_fit    = 0.45;  // 套環／插座對立柱的滑配間隙
seg_len     = 220;   // 主立柱節（A1 直立列印，離 256 上限留足餘裕）
seg_short   = 120;   // 加長節
plug_len    = 80;    // 接頭總長（上下各插入約 38）
plug_fit    = 0.35;

// --- 前伸臂 ----------------------------------------------------------------
arm_w       = 12;    // 臂寬＝迎光面。做窄，在紙上只投一條淡線而不是一塊影子。
arm_h       = 30;    // 臂高＝剛性方向
collar_h    = 45;
collar_wall = 7;
tab_h       = 46;    // 臂尖立板高度
bolt_z1     = 14;    // 臂尖立板：樞軸孔高度
bolt_dz     = 22;    // 樞軸孔到弧槽的距離
tilt_deg    = 8;     // 傾角微調 ±8°

// --- 底座 ------------------------------------------------------------------
foot_x        = 150;
foot_y        = 170;
foot_t        = 6;
foot_front    = -55;  // 底板前緣的 Y。紙的後緣在 -45，所以底板完全不壓到紙
                      // （壓到的話 6 mm 厚度會把紙的後緣墊高，整張紙變斜的）
foot_socket_h = 68;   // 立柱插入深度
foot_hole_dx  = 110;  // 鎖到你自己底座的 M4 孔距（X）
foot_hole_dy  = 110;  // 同上（Y）
tray_h        = 12;   // 配重槽深度（放硬幣／墊圈／沙包，抵銷前伸臂的傾覆力矩）

// --- 五金 ------------------------------------------------------------------
m4_clear  = 4.5;   // M4 通孔
m4_tap    = 3.4;   // M4 自攻底孔。PLA/PETG 直接鎖進去，省掉螺帽也不會掉零件。
m4_head   = 8.0;
m4_nut_af = 7.0;   // M4 螺帽對邊（只有立柱接頭用埋入式螺帽）
m4_nut_t  = 3.4;

// --- 列印餘裕 --------------------------------------------------------------
wall = 3;
lip  = 2.5;        // 環底擋唇 —— 攝影機的重量全部走這一圈
slop = 0.3;

$fa = 2;
$fs = 0.4;

// ---------------------------------------------------------------------------
// 由參數推導出來的介面尺寸
// 兩件要對得上的地方一律互相推導，不各寫各的（上一版就是這樣寫壞的）。
// ---------------------------------------------------------------------------

socket_in   = mast + mast_fit;
socket_out  = socket_in + 2 * wall + 2;
collar_hole = mast + mast_fit;
collar_out  = collar_hole + 2 * collar_wall;

// 托架座標系：原點 = 鏡頭光軸，z = 0 是環的底面。
// 機身正面落在 z = lip，背面在 z = lip + cam_thick。
ring_iw   = cam_w + cam_fit;              // 環內長邊
ring_ih   = cam_h + cam_fit;              // 環內短邊
ring_h    = cam_rim + lip;                // 環總高
ring_x0   = -cam_lens_x - cam_fit / 2 - wall;   // 環的左外緣（鏡頭偏心 17 反映在這）

brk_t     = 10;                           // 托架立板厚
brk_x1    = ring_x0;                      // 立板貼在環的左外壁
brk_x0    = brk_x1 - brk_t;               // 立板外側面 = 與臂尖立板的貼合面
cam_gap   = 4.5;                          // 機身背面到臂底面要留的餘隙
cradle_drop = lip + cam_thick + cam_gap;  // 托架原點比臂底面低多少（機身不能撞到臂）
brk_h     = bolt_z1 + bolt_dz + 14 + cradle_drop;  // 讓兩個鎖孔剛好對上臂尖立板

// 貼合面 = 托架立板的「內」側面。取成外側面的話兩片立板會佔同一塊空間。
mate_x     = brk_x1 - brk_t;              // 托架立板外側面
arm_tab_x0 = brk_x1;                      // 臂尖立板從托架立板的內側面往 +X 長
arm_tab_w  = arm_w / 2 - arm_tab_x0;      // 一路長到臂本體
arm_bottom = lens_height + cradle_drop - lip;   // 臂底面該架在多高

// ---------------------------------------------------------------------------
// 共用小工具
// ---------------------------------------------------------------------------

// 膠囊形（stadium）—— C270 機身正面就是這個形狀
module stadium2d(w, h) {
    hull() {
        translate([-(w - h) / 2, 0]) circle(d = h);
        translate([ (w - h) / 2, 0]) circle(d = h);
    }
}

// 六角螺帽袋：沿 +X 挖進去，尖端朝上（頂部是兩個 60° 斜面，免支撐）
module nut_pocket(depth) {
    rotate([0, 90, 0]) cylinder(h = depth, d = m4_nut_af / cos(30), $fn = 6);
}

// 夾緊底孔：原點在「被夾的那根柱子的表面」，往 +X 鑽出去 len。
// 尖端往內多探 1.5 mm，螺絲才頂得到立柱。自攻，不用螺帽。
module clamp_tap(len) {
    translate([-1.5, 0, 0]) rotate([0, 90, 0]) cylinder(h = len + 1.5, d = m4_tap);
}

// ---------------------------------------------------------------------------
// 零件 1：底座 foot
// 列印方向：如模型，底板貼床。免支撐（插座是垂直管、肋的斜邊離水平 63°）。
// ---------------------------------------------------------------------------
module foot() {
    difference() {
        union() {
            translate([-foot_x / 2, foot_front, 0]) cube([foot_x, foot_y, foot_t]);
            linear_extrude(foot_socket_h) offset(r = 3) square(socket_out - 6, center = true);
            for (a = [0, 90, 180, 270]) rotate([0, 0, a]) foot_rib();
            // 夾緊螺牙凸座：把咬合長度撐到 15 mm，手轉的力量就鎖得死
            translate([socket_out / 2 - 2, -8, foot_socket_h - 27]) cube([12, 16, 18]);
            // 配重槽放在立柱「後方」。前伸臂會讓整支往前倒，要靠後面的重量拉住 ——
            // 放前面完全沒有用，而且會壓到紙。
            translate([-foot_x / 2, foot_front + foot_y - 60, 0])
                difference() {
                    cube([foot_x, 60, foot_t + tray_h]);
                    translate([wall, wall, foot_t])
                        cube([foot_x - 2 * wall, 60 - 2 * wall, tray_h + 1]);
                }
        }
        translate([0, 0, -1]) linear_extrude(foot_socket_h + 2) square(socket_in, center = true);
        // 夾緊旋鈕：把立柱頂到對面兩個內角＝三點定位，不會晃也不會轉
        translate([socket_in / 2, 0, foot_socket_h - 18]) clamp_tap(15);
        // 鎖到你自己底座的四個孔，沉頭做在底面（螺絲頭不會把底板墊高）
        for (x = [-1, 1], y = [-1, 1])
            translate([x * foot_hole_dx / 2, foot_front + foot_y / 2 + y * foot_hole_dy / 2, -1]) {
                cylinder(h = foot_t + 2, d = m4_clear);
                translate([0, 0, 0.5]) cylinder(h = 3, d = m4_head + 0.6);
            }
    }
}

// 三角肋：斜邊離水平 63°，遠在免支撐角度內
module foot_rib() {
    translate([socket_out / 2 - 2, 0, 0])
        rotate([90, 0, 0])
            linear_extrude(wall + 1, center = true)
                polygon([[0, 0], [30, 0], [0, foot_socket_h - 10]]);
}

// ---------------------------------------------------------------------------
// 零件 2／3：立柱節 —— 方管，兩端各一個接頭螺絲通孔
// 列印方向：直立。加 brim，不用支撐。
// ---------------------------------------------------------------------------
module mast_segment(len) {
    bore = mast - 2 * mast_wall;
    difference() {
        linear_extrude(len) offset(r = 2) square(mast - 4, center = true);
        translate([0, 0, -1]) linear_extrude(len + 2) square(bore, center = true);
        for (z = [20, len - 20])
            translate([0, 0, z]) rotate([0, 90, 0])
                translate([0, 0, -mast]) cylinder(h = 2 * mast, d = m4_clear);
    }
}

// ---------------------------------------------------------------------------
// 零件 4：接頭 plug —— 插進上下兩節立柱，中央凸緣當對接止點
// 螺絲從管外穿進來鎖住埋在接頭裡的螺帽；鎖緊時螺帽靠內側肩部承力，
// 而且接頭一插進管子螺帽就掉不出來。
// 列印方向：直立。螺帽袋尖端朝上，免支撐。
// ---------------------------------------------------------------------------
module plug() {
    s = mast - 2 * mast_wall - plug_fit;
    difference() {
        union() {
            linear_extrude(plug_len) square(s, center = true);
            translate([0, 0, plug_len / 2 - 1.5])
                linear_extrude(3) square(mast - 4, center = true);
        }
        for (z = [20, plug_len - 20]) {
            translate([0, 0, z]) rotate([0, 90, 0])
                translate([0, 0, -s]) cylinder(h = 2 * s, d = m4_clear);
            translate([s / 2 - m4_nut_t, 0, z]) nut_pocket(m4_nut_t + 0.2);
        }
        // 減重孔留小一點，螺帽袋後面才有 3.6 mm 實料撐著
        translate([0, 0, -1]) cylinder(h = plug_len + 2, d = s - 14);
    }
}

// ---------------------------------------------------------------------------
// 零件 5：套環＋前伸臂 arm（一體 —— 少一個接合面就少一份晃動）
// 列印方向：如模型，套環軸朝 Z、臂底面貼床。全程免支撐。
// 攝影機整個掛在臂的 -X 側，鏡頭光軸剛好落在 X = 0（立柱軸心的鉛垂線）。
// ---------------------------------------------------------------------------
module arm() {
    difference() {
        union() {
            linear_extrude(collar_h) offset(r = 4) square(collar_out - 8, center = true);
            translate([-arm_w / 2, -arm_reach, 0]) cube([arm_w, arm_reach, arm_h]);
            // 臂根補強（水平三角形，貼床列印）
            translate([ arm_w / 2, -collar_out / 2, 0]) rotate([0, 0, 90])
                linear_extrude(arm_h) polygon([[0, 0], [30, 0], [0, -arm_w]]);
            translate([-arm_w / 2, -collar_out / 2, 0]) rotate([0, 0, 90])
                linear_extrude(arm_h) polygon([[0, 0], [30, 0], [0,  arm_w]]);
            // 臂尖立板：托架的立板貼在 x = arm_tab_x0 這個面上
            translate([arm_tab_x0, -arm_reach, 0]) cube([arm_tab_w, 16, tab_h]);
            // 立柱夾緊螺牙凸座。深度要比底孔淺，不然孔鑽不穿凸座外壁、螺絲進不去。
            // （底孔是 clamp_tap(15)，從立柱表面往外 15；凸座外緣在 +10，留 1 mm 穿透）
            translate([-8, collar_out / 2 - 2, collar_h / 2 - 9]) cube([16, 10, 18]);
        }
        translate([0, 0, -1]) linear_extrude(collar_h + 2) square(collar_hole, center = true);
        // 立柱夾緊旋鈕（從後方 +Y 鎖進來）
        translate([0, collar_hole / 2, collar_h / 2]) rotate([0, 0, 90]) clamp_tap(15);
        // 托架鎖點：一個樞軸圓孔 + 一道 ±8° 弧槽（自攻，托架那邊是通孔）
        translate([0, -arm_reach + 8, bolt_z1]) {
            rotate([0, 90, 0]) translate([0, 0, -40]) cylinder(h = 80, d = m4_tap);
            for (a = [-tilt_deg : 1 : tilt_deg])
                rotate([a, 0, 0]) translate([0, 0, bolt_dz]) rotate([0, 90, 0])
                    translate([0, 0, -40]) cylinder(h = 80, d = m4_tap);
        }
    }
    // USB 走線夾：線貼著臂走，攝影機端完全不受力。
    // （1.5 m 的線吊在 75 g 的機身上會把它拉歪、而且會一直晃）
    for (y = [-45, -90, -138]) translate([0, y, arm_h]) cable_clip();
}

// C 形扣線夾，開口朝上，線壓進去就卡住。無橋接。
module cable_clip() {
    difference() {
        translate([-5, -4, 0]) cube([10, 8, 9]);
        translate([0, 0, 5.5]) rotate([90, 0, 0]) cylinder(h = 12, d = 6.5, center = true);
        translate([-2.2, -6, 5.5]) cube([4.4, 12, 5]);
    }
}

// ---------------------------------------------------------------------------
// 零件 6：攝影機托架 cradle（單一個環）
//
// 受力分工：
//   * 重量 → 環底那圈 2.5 mm 擋唇。機械式，不會失效。
//   * 不晃、不掉 → 背面跨過去的魔鬼氈帶，或環內壁貼的泡棉雙面膠。
// 膠絕對不是受力路徑：就算完全失黏，攝影機也只是鬆鬆掛著，不會從 45 cm 摔下去。
//
// 環內故意放鬆 cam_fit = 1.5，泡棉雙面膠當墊片吃掉間隙 ——
// 這樣就算 cam_h 實際是 31 或 33 也一樣裝得上。
//
// 列印方向：如模型，擋唇貼床。環是垂直通孔、立板是垂直平板、補強是上小下大的楔形，
//           全程沒有任何橋接或懸空，免支撐。
// ---------------------------------------------------------------------------
module cradle() {
    cx      = cam_w / 2 - cam_lens_x;   // 環中心（鏡頭偏心 17 就反映在這）
    blk_len = brk_t + 16;               // 左端加厚塊長度
    difference() {
        union() {
            // 環外形（實心，容室稍後才挖）
            translate([cx, 0, 0])
                linear_extrude(ring_h) stadium2d(ring_iw + 2 * wall, ring_ih + 2 * wall);
            // 左端加厚塊。立板不能只靠切線碰到環 —— 那只有一條線的接觸，
            // 既不是有效的 2-manifold，實際上也等於沒接合。這塊給它實在的接合面積。
            translate([brk_x0, -(ring_ih / 2 + wall), 0])
                cube([blk_len, ring_ih + 2 * wall, ring_h]);
            // 立板
            translate([brk_x0, -9, 0]) cube([brk_t, 18, brk_h]);
            // 立板補強楔形：每一層都比下一層小，完全沒有懸空
            translate([brk_x0, -9, 0]) rotate([-90, 0, 0]) linear_extrude(18)
                polygon([[0, 0], [0, -32], [blk_len, 0]]);
        }
        // 機身容室（從擋唇上表面往上）
        translate([cx, 0, lip])
            linear_extrude(ring_h) stadium2d(ring_iw, ring_ih);
        // 擋唇開口：往內縮 lip 的一圈平台，攝影機正面外緣壓在上面 —— 重量全走這裡
        translate([cx, 0, -1])
            linear_extrude(lip + 1) offset(r = -lip) stadium2d(ring_iw, ring_ih);
        // 束帶凹口：魔鬼氈帶從這裡跨過機身背面（開口朝上，免支撐）
        for (y = [-1, 1])
            translate([cx, y * (ring_ih / 2 + wall / 2 + 0.5), ring_h - 4])
                cube([16, wall + 2, 14], center = true);
        // 立板上的兩個通孔，對應臂尖的樞軸孔與弧槽
        for (z = [brk_h - 14, brk_h - 14 - bolt_dz])
            translate([brk_x0 - 1, 0, z]) rotate([0, 90, 0])
                cylinder(h = brk_t + 2, d = m4_clear);
    }
}

// ---------------------------------------------------------------------------
// 零件 7：旋鈕 knob（共 4 顆：底座 1、套環 1、立柱接頭 2）
// 六角袋壓入 M4 內六角螺絲頭，之後全程免工具。
// ---------------------------------------------------------------------------
module knob() {
    d = 26; h = 12;
    difference() {
        cylinder(d = d, h = h);
        for (a = [0 : 60 : 359])
            rotate([0, 0, a]) translate([d / 2, 0, -1]) cylinder(d = 7, h = h + 2);
        translate([0, 0, h - 4.2]) cylinder(d = m4_head / cos(30) + 0.3, h = 5, $fn = 6);
        translate([0, 0, -1]) cylinder(d = m4_clear + 0.4, h = h);
    }
}

// ---------------------------------------------------------------------------
// 零件 8：試裝規 gauge —— 先印這個！約 10 分鐘、幾克料。
// 就是托架的環，用來驗 cam_w / cam_h / cam_rim / cam_fit。
// 機身放得進去、四周有一點點縫（要靠泡棉膠墊掉），才印其他零件。
// ---------------------------------------------------------------------------
module gauge() {
    difference() {
        union() {
            linear_extrude(ring_h)
                difference() {
                    stadium2d(ring_iw + 2 * wall, ring_ih + 2 * wall);
                    stadium2d(ring_iw, ring_ih);
                }
            linear_extrude(lip)
                difference() {
                    stadium2d(ring_iw + 2 * wall, ring_ih + 2 * wall);
                    offset(r = -lip) stadium2d(ring_iw, ring_ih);
                }
        }
        // 刻上尺寸，才知道手上這片是哪一版
        translate([0, 0, ring_h - 0.6])
            linear_extrude(1) text(str(cam_w, "x", cam_h), size = 5,
                                   halign = "center", valign = "center");
        // 中間開一個推出口，手指才推得出來
        translate([0, 0, -1]) linear_extrude(lip + 1)
            square([26, ring_ih + 2 * wall + 2], center = true);
    }
}

// ---------------------------------------------------------------------------
// 組合預覽（示意用，不匯出）
// ---------------------------------------------------------------------------
module assembly() {
    color("dimgray")   foot();
    color("steelblue") translate([0, 0, foot_t]) mast_segment(seg_len);
    color("steelblue") translate([0, 0, foot_t + seg_len + 3]) mast_segment(seg_len);
    color("steelblue") translate([0, 0, foot_t + 2 * seg_len + 6]) mast_segment(seg_short);
    color("orange")    translate([0, 0, arm_bottom]) arm();
    color("seagreen")  translate([0, -arm_reach + 8, arm_bottom - cradle_drop]) cradle();
    color("white")     translate([-148.5, -arm_reach + 8 - 105, -1]) cube([297, 210, 1]);
}

// ---------------------------------------------------------------------------
if      (part == "foot")       foot();
else if (part == "mast")       mast_segment(seg_len);
else if (part == "mast_short") mast_segment(seg_short);
else if (part == "plug")       plug();
else if (part == "arm")        arm();
else if (part == "cradle")     cradle();
else if (part == "knob")       knob();
else if (part == "gauge")      gauge();
else                           assembly();
