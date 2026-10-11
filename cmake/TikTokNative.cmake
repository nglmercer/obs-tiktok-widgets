include(FetchContent)
set(TIKTOK_REVISION 886157c10350c7def971f782451462db72bc0007)
set(TIKTOK_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vendor/tiktok-signer" CACHE PATH "Pinned native source checkout")
if(NOT EXISTS "${TIKTOK_SOURCE_DIR}/Cargo.toml")
  FetchContent_Declare(tiktok GIT_REPOSITORY https://github.com/nglmercer/tiktok-signer GIT_TAG ${TIKTOK_REVISION})
  FetchContent_MakeAvailable(tiktok)
  set(TIKTOK_SOURCE_DIR "${tiktok_SOURCE_DIR}")
endif()
execute_process(
  COMMAND git rev-parse HEAD
  WORKING_DIRECTORY "${TIKTOK_SOURCE_DIR}"
  OUTPUT_VARIABLE native_revision
  OUTPUT_STRIP_TRAILING_WHITESPACE
  COMMAND_ERROR_IS_FATAL ANY
)
if(NOT native_revision STREQUAL TIKTOK_REVISION)
  message(FATAL_ERROR "Native checkout does not match pinned ABI revision")
endif()
find_program(CARGO cargo REQUIRED)
set(TTL_TARGET_DIR "${CMAKE_BINARY_DIR}/rust" CACHE PATH "Cargo artifact directory")
if(WIN32)
  set(TTL_LIBRARY "${TTL_TARGET_DIR}/release/ttl_live.dll")
  set(TTL_IMPLIB "${TTL_TARGET_DIR}/release/ttl_live.dll.lib")
elseif(APPLE)
  set(TTL_LIBRARY "${TTL_TARGET_DIR}/release/libttl_live.dylib")
else()
  set(TTL_LIBRARY "${TTL_TARGET_DIR}/release/libttl_live.so")
endif()
if(APPLE)
  add_custom_command(
    OUTPUT "${TTL_LIBRARY}"
    COMMAND
      ${CMAKE_COMMAND} "-DCARGO=${CARGO}" "-DSOURCE_DIR=${TIKTOK_SOURCE_DIR}" "-DTARGET_DIR=${TTL_TARGET_DIR}" -P
      "${CMAKE_CURRENT_SOURCE_DIR}/cmake/BuildNativeMac.cmake"
    COMMENT "Building universal Rust native library"
    VERBATIM
  )
else()
  add_custom_command(
    OUTPUT "${TTL_LIBRARY}"
    COMMAND
      ${CMAKE_COMMAND} -E env "CARGO_TARGET_DIR=${TTL_TARGET_DIR}" ${CARGO} build --release --locked -p ttl-live-native
    WORKING_DIRECTORY "${TIKTOK_SOURCE_DIR}"
    COMMENT "Building pinned Rust C ABI"
    VERBATIM
  )
endif()
add_custom_target(tiktok-native-build DEPENDS "${TTL_LIBRARY}")
add_library(tiktok-native SHARED IMPORTED GLOBAL)
set_target_properties(
  tiktok-native
  PROPERTIES
    IMPORTED_LOCATION "${TTL_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${TIKTOK_SOURCE_DIR}/crates/ttl-live-native/include"
)
if(WIN32)
  set_target_properties(tiktok-native PROPERTIES IMPORTED_IMPLIB "${TTL_IMPLIB}")
endif()
if(UNIX AND NOT APPLE)
  set_target_properties(tiktok-native PROPERTIES IMPORTED_NO_SONAME TRUE)
endif()
add_dependencies(tiktok-native tiktok-native-build)
