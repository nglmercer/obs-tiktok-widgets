cmake_minimum_required(VERSION 3.28...3.30)
include("${CMAKE_CURRENT_SOURCE_DIR}/cmake/common/bootstrap.cmake" NO_POLICY_SCOPE)
project(${_name} VERSION ${_version} LANGUAGES C CXX)
option(ENABLE_FRONTEND_API "OBS frontend" ON)
option(ENABLE_QT "Qt dock" ON)
if(NOT ENABLE_QT OR NOT ENABLE_FRONTEND_API)
  message(FATAL_ERROR "Qt and frontend API are required")
endif()
include(compilerconfig)
include(defaults)
include(helpers)
include(cmake/Dependencies.cmake)
include(cmake/TikTokNative.cmake)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
file(GLOB_RECURSE PLUGIN_SOURCES CONFIGURE_DEPENDS src/*.cpp src/*.hpp)
add_library(${PROJECT_NAME} MODULE ${PLUGIN_SOURCES})
target_include_directories(${PROJECT_NAME} PRIVATE src vendor)
target_link_libraries(
  ${PROJECT_NAME}
  PRIVATE OBS::libobs OBS::obs-frontend-api Qt6::Core Qt6::Widgets Qt6::Network tiktok-native
)
set_target_properties_plugin(${PROJECT_NAME} PROPERTIES OUTPUT_NAME ${_name})
if(APPLE)
  set_target_properties(${PROJECT_NAME} PROPERTIES INSTALL_RPATH "@loader_path/../Frameworks")
  install(FILES "${TTL_LIBRARY}" DESTINATION "${_name}.plugin/Contents/Frameworks")
elseif(WIN32)
  install(FILES "${TTL_LIBRARY}" DESTINATION "${PROJECT_NAME}/bin/64bit")
else()
  set_target_properties(${PROJECT_NAME} PROPERTIES INSTALL_RPATH "$ORIGIN")
  install(FILES "${TTL_LIBRARY}" DESTINATION "${CMAKE_INSTALL_LIBDIR}/obs-plugins")
endif()
include(CTest)
if(BUILD_TESTING)
  add_executable(events-test tests/events/events-test.cpp src/core/EventNormalizer.cpp src/core/EventDispatcher.cpp)
  target_include_directories(events-test PRIVATE src)
  target_link_libraries(events-test PRIVATE Qt6::Core tiktok-native)
  add_test(NAME events COMMAND events-test)
  add_executable(
    connection-test
    tests/native/connection-test.cpp
    src/core/TikTokConnectionManager.cpp
    src/core/EventNormalizer.cpp
    src/core/EventDispatcher.cpp
  )
  target_include_directories(connection-test PRIVATE src)
  target_compile_definitions(connection-test PRIVATE TTL_STATIC)
  target_link_libraries(connection-test PRIVATE Qt6::Core tiktok-native)
  add_test(NAME connection-lifecycle COMMAND connection-test)
  add_executable(
    widget-test
    tests/widgets/config-test.cpp
    src/widgets/WidgetManager.cpp
    src/widgets/WidgetConfig.cpp
    src/widgets/WidgetRegistry.cpp
  )
  target_include_directories(widget-test PRIVATE src)
  target_compile_definitions(widget-test PRIVATE WIDGET_ASSETS="${CMAKE_CURRENT_SOURCE_DIR}/data/web")
  target_link_libraries(widget-test PRIVATE Qt6::Core)
  add_test(NAME widget-config COMMAND widget-test)
  add_executable(
    bridge-test
    tests/integration/bridge-test.cpp
    src/core/BrowserEventBridge.cpp
    src/core/EventNormalizer.cpp
  )
  target_include_directories(bridge-test PRIVATE src vendor)
  target_link_libraries(bridge-test PRIVATE OBS::libobs Qt6::Core tiktok-native)
  add_test(NAME bridge-api COMMAND bridge-test)
  add_executable(source-persistence-test tests/widgets/source-persistence-test.cpp
    src/widgets/WidgetManager.cpp src/widgets/WidgetConfig.cpp src/widgets/WidgetRegistry.cpp)
  target_include_directories(source-persistence-test PRIVATE src)
  target_compile_definitions(source-persistence-test PRIVATE WIDGET_ASSETS="${CMAKE_CURRENT_SOURCE_DIR}/data/web")
  target_link_libraries(source-persistence-test PRIVATE OBS::libobs Qt6::Core)
  add_test(NAME source-persistence COMMAND source-persistence-test)
  add_executable(bundle-test tests/native/bundle-test.cpp src/core/SigningBundleManager.cpp src/core/PluginConfig.cpp)
  target_include_directories(bundle-test PRIVATE src)
  target_link_libraries(bundle-test PRIVATE Qt6::Core Qt6::Network)
  add_test(NAME automatic-bundle COMMAND bundle-test)
  file(GLOB DOCK_UI_SOURCES src/ui/*.cpp)
  add_executable(
    dock-test
    tests/widgets/dock-test.cpp
    ${DOCK_UI_SOURCES}
    src/core/SigningBundleManager.cpp
    src/core/PluginConfig.cpp
    src/core/TikTokConnectionManager.cpp
    src/core/EventNormalizer.cpp
    src/core/EventDispatcher.cpp
    src/widgets/WidgetManager.cpp
    src/widgets/WidgetConfig.cpp
    src/widgets/WidgetRegistry.cpp
    src/obs/BrowserSourceManager.cpp
    src/obs/OBSFrontendManager.cpp
  )
  target_include_directories(dock-test PRIVATE src)
  target_compile_definitions(dock-test PRIVATE WIDGET_ASSETS="${CMAKE_CURRENT_SOURCE_DIR}/data/web")
  target_link_libraries(
    dock-test
    PRIVATE OBS::libobs OBS::obs-frontend-api Qt6::Core Qt6::Widgets Qt6::Network tiktok-native
  )
  add_test(NAME tabbed-dock COMMAND dock-test)
  set_tests_properties(tabbed-dock PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endif()
set(CPACK_PACKAGE_NAME ${PROJECT_NAME})
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
set(CPACK_GENERATOR ZIP)
set(CPACK_PACKAGE_FILE_NAME "${PROJECT_NAME}-${PROJECT_VERSION}-${CMAKE_SYSTEM_NAME}-${CMAKE_SYSTEM_PROCESSOR}")
set(CPACK_SOURCE_IGNORE_FILES "\\.git/;build[^/]*/;vendor/tiktok-signer/target/;node_modules/;stage/;release/")
include(CPack)
