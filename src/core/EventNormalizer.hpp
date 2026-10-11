#pragma once
#include <QJsonObject>
#include <QString>
#include <ttl/ttl.h>
namespace tt {
inline constexpr int ContractVersion = 1;
class EventNormalizer {
public:
	static QJsonObject fromNative(const ttl_event_t *, const QString &room);
	static QJsonObject fromJson(const QJsonObject &, const QString &room);
	static QJsonObject synthetic(const QString &type, int sequence = 1);
	static bool isFollow(const QJsonObject &);
};
} // namespace tt
