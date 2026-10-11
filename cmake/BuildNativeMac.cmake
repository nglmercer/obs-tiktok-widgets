foreach(triple IN ITEMS aarch64-apple-darwin x86_64-apple-darwin)
  execute_process(
    COMMAND
      "${CMAKE_COMMAND}" -E env "CARGO_TARGET_DIR=${TARGET_DIR}" "${CARGO}" build --release --locked -p ttl-live-native
      --target ${triple}
    WORKING_DIRECTORY "${SOURCE_DIR}"
    COMMAND_ERROR_IS_FATAL ANY
  )
endforeach()
file(MAKE_DIRECTORY "${TARGET_DIR}/release")
execute_process(
  COMMAND
    lipo -create "${TARGET_DIR}/aarch64-apple-darwin/release/libttl_live.dylib"
    "${TARGET_DIR}/x86_64-apple-darwin/release/libttl_live.dylib" -output "${TARGET_DIR}/release/libttl_live.dylib"
  COMMAND_ERROR_IS_FATAL ANY
)
execute_process(
  COMMAND install_name_tool -id @rpath/libttl_live.dylib "${TARGET_DIR}/release/libttl_live.dylib"
  COMMAND_ERROR_IS_FATAL ANY
)
