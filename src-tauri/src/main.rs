// Không mở thêm cửa sổ console trên Windows ở bản phát hành — ĐỪNG XOÁ.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  endfield_planner_lib::run();
}
