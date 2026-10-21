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
list(FILTER PLUGIN_SOURCES EXCLUDE REGEX "/(cli|studio)/")
file(GLOB PROJECT_DOMAIN_SOURCES CONFIGURE_DEPENDS src/projects/*.cpp src/templates/*.cpp)
find_package(ZLIB REQUIRED)
add_library(widget-domain STATIC ${PROJECT_DOMAIN_SOURCES} src/widgets/WidgetConfig.cpp)
set_target_properties(widget-domain PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_include_directories(widget-domain PUBLIC src)
target_link_libraries(widget-domain PUBLIC Qt6::Core Qt6::Network ZLIB::ZLIB)
list(FILTER PLUGIN_SOURCES EXCLUDE REGEX "/(projects|templates)/|/WidgetConfig.cpp$")
add_library(${PROJECT_NAME} MODULE ${PLUGIN_SOURCES})
target_include_directories(${PROJECT_NAME} PRIVATE src vendor)
target_link_libraries(
  ${PROJECT_NAME}
  PRIVATE OBS::libobs OBS::obs-frontend-api Qt6::Core Qt6::Widgets Qt6::Network tiktok-native widget-domain
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
  add_executable(widget-telemetry-test tests/widgets/telemetry-test.cpp src/widgets/WidgetTelemetryServer.cpp src/widgets/WidgetHealthManager.cpp)
  target_include_directories(widget-telemetry-test PRIVATE src)
  target_link_libraries(widget-telemetry-test PRIVATE Qt6::Core Qt6::Network)
  add_test(NAME widget-telemetry COMMAND widget-telemetry-test)
  add_executable(widget-health-test tests/widgets/health-test.cpp src/widgets/WidgetHealthManager.cpp)
  target_include_directories(widget-health-test PRIVATE src)
  target_link_libraries(widget-health-test PRIVATE Qt6::Core)
  add_test(NAME widget-health COMMAND widget-health-test)
  add_executable(universal-receiver-test tests/universal/receiver-test.cpp src/universal/ExternalEventReceiver.cpp src/core/EventDispatcher.cpp)
  target_include_directories(universal-receiver-test PRIVATE src)
  target_link_libraries(universal-receiver-test PRIVATE Qt6::Core Qt6::Network)
  target_compile_definitions(universal-receiver-test PRIVATE UNIVERSAL_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/web/universal/fixtures")
  add_test(NAME universal-receiver COMMAND universal-receiver-test)
  add_executable(universal-receiver-runner tests/universal/receiver-runner.cpp src/universal/ExternalEventReceiver.cpp src/core/EventDispatcher.cpp)
  target_include_directories(universal-receiver-runner PRIVATE src)
  target_link_libraries(universal-receiver-runner PRIVATE Qt6::Core Qt6::Network)
  add_executable(studio-launcher-test tests/widgets/studio-launcher-test.cpp)
  target_include_directories(studio-launcher-test PRIVATE src)
  target_link_libraries(studio-launcher-test PRIVATE Qt6::Core widget-domain)
  add_test(NAME studio-launcher COMMAND studio-launcher-test)
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
  target_link_libraries(widget-test PRIVATE Qt6::Core widget-domain)
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
    src/widgets/WidgetManager.cpp src/widgets/WidgetConfig.cpp src/widgets/WidgetRegistry.cpp src/obs/BrowserSourceManager.cpp)
  target_include_directories(source-persistence-test PRIVATE src)
  target_compile_definitions(source-persistence-test PRIVATE WIDGET_ASSETS="${CMAKE_CURRENT_SOURCE_DIR}/data/web")
  target_link_libraries(source-persistence-test PRIVATE OBS::libobs OBS::obs-frontend-api Qt6::Core widget-domain)
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
    PRIVATE OBS::libobs OBS::obs-frontend-api Qt6::Core Qt6::Widgets Qt6::Network tiktok-native widget-domain
  )
  add_test(NAME tabbed-dock COMMAND dock-test)
  if(WIN32)
    set_tests_properties(tabbed-dock PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=minimal")
  else()
    set_tests_properties(tabbed-dock PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
  endif()
endif()
set(CPACK_PACKAGE_NAME ${PROJECT_NAME})
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
set(CPACK_GENERATOR ZIP)
string(REPLACE "\\" "/" CPACK_INSTALL_PREFIX "${CMAKE_INSTALL_PREFIX}")
set(CPACK_PACKAGE_FILE_NAME "${PROJECT_NAME}-${PROJECT_VERSION}-${CMAKE_SYSTEM_NAME}-${CMAKE_SYSTEM_PROCESSOR}")
set(CPACK_SOURCE_IGNORE_FILES "\\.git/;\\.deps/;\\.tools/;\\.npm-cache/;build[^/]*/;vendor/tiktok-signer/target/;node_modules/;stage/;release/")
include(CPack)

add_executable(widgetctl src/cli/widgetctl.cpp)
target_link_libraries(widgetctl PRIVATE widget-domain)
install(TARGETS widgetctl RUNTIME DESTINATION bin)
if(UNIX AND NOT APPLE)
  install(PROGRAMS tools/widgetctl-flatpak.sh DESTINATION bin)
endif()
if(APPLE)
  set(author_resources "${_name}.plugin/Contents/Resources")
elseif(WIN32)
  set(author_resources "${PROJECT_NAME}/data")
else()
  set(author_resources "${CMAKE_INSTALL_DATAROOTDIR}/obs/obs-plugins/${PROJECT_NAME}")
endif()
install(DIRECTORY skills/obs-tiktok-widget-author DESTINATION "${author_resources}/skills")
install(FILES docs/WIDGETCTL.md docs/TEMPLATE_ENGINE_V2.md docs/AGENT_WORKFLOWS.md docs/EVENT_PLAYGROUND.md docs/STUDIO_V3.md docs/UI_V4.md docs/VALIDATION.md docs/UNIVERSAL_WIDGETS.md docs/COMPOSITIONS.md docs/COMPOSITION_GUIDE.md docs/COMPOSITION_GUIDE.es.md docs/SCREENSHOTS.md
  DESTINATION "${author_resources}/docs")
install(DIRECTORY docs/architecture DESTINATION "${author_resources}/docs")
install(DIRECTORY docs/validation/compositions DESTINATION "${author_resources}/docs/validation")

add_executable(widgetstudio src/cli/widgetstudio.cpp src/studio/StudioServer.cpp)
target_link_libraries(widgetstudio PRIVATE widget-domain Qt6::Network)
install(TARGETS widgetstudio RUNTIME DESTINATION bin)

if(WIN32)
 install(TARGETS widgetstudio widgetctl RUNTIME DESTINATION "${PROJECT_NAME}/bin/64bit")
elseif(APPLE)
 install(TARGETS widgetstudio widgetctl RUNTIME DESTINATION "${_name}.plugin/Contents/MacOS")
endif()
