#pragma once
#include <ttl/ttl.h>
#include <memory>
namespace tt {
struct NativeClientDeleter {
	void operator()(ttl_live_client_t *p) const noexcept
	{
		if (p) {
			ttl_live_client_disconnect(p);
			ttl_live_client_destroy(p);
		}
	}
};
using NativeClientWrapper = std::unique_ptr<ttl_live_client_t, NativeClientDeleter>;
} // namespace tt
