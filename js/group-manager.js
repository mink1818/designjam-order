/*
=====================================
상품목록 전용 모듈
Design Socks Manager
=====================================
*/

let groupManagerInitialized = false;

function initializeGroupManager() {

    if(groupManagerInitialized){
        return;
    }

    groupManagerInitialized = true;

    console.log("Group Manager Loaded");

}

window.initializeGroupManager =
initializeGroupManager;

/* 자동 실행 */
initializeGroupManager();