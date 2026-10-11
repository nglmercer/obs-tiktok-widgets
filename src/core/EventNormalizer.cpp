#include "EventNormalizer.hpp"
#include <QJsonDocument>
#include <QDateTime>
#include <memory>
#include <stdexcept>
namespace tt {
QJsonObject EventNormalizer::fromNative(const ttl_event_t *e, const QString &room)
{
	std::unique_ptr<char, decltype(&ttl_string_free)> text(ttl_event_to_json(e, TTL_JSON_FULL), ttl_string_free);
	if (!text)
		throw std::runtime_error("Native event serialization failed");
	auto o = QJsonDocument::fromJson(QByteArray(text.get())).object();
	auto result = fromJson(o, room);
	if (ttl_event_support(e) == TTL_EVENT_SUPPORT_RAW) {
		const auto *bytes = ttl_event_raw_data(e);
		result["rawPayload"] = QString::fromLatin1(
			QByteArray(reinterpret_cast<const char *>(bytes), static_cast<qsizetype>(ttl_event_raw_size(e)))
				.toBase64());
	}
	return result;
}
QJsonObject EventNormalizer::fromJson(const QJsonObject &o, const QString &room)
{
	auto n = o["normalized"].toObject();
	QString type = n["type"].toString("unknown");
	if (type == "room_user")
		type = "roomUser";
	n.remove("type");
	return {{"version", ContractVersion},
		{"type", type},
		{"room", room},
		{"method", o["method"]},
		{"messageId", o["messageId"]},
		{"isHistory", o["history"]},
		{"sourceTimestamp", o["timestamp"]},
		{"sourceTimestampUnit", "server-defined"},
		{"receivedTimestamp", QString::number(QDateTime::currentMSecsSinceEpoch())},
		{"data", n.isEmpty() ? o["data"] : QJsonValue(n)},
		{"native", o}};
}
bool EventNormalizer::isFollow(const QJsonObject &e)
{
	const auto fields = e["native"].toObject()["data"].toObject();
	const auto key = fields["common"].toObject()["displayText"].toObject()["key"].toString();
	// Upstream TikTok-Live-Connector identifies follows by the server's display key.
	// A social action or follow_count alone does not establish a follow.
	return e["type"] == "follow" ||
	       (e["method"] == "WebcastSocialMessage" && key.contains("follow", Qt::CaseInsensitive) &&
		!key.contains("unfollow", Qt::CaseInsensitive));
}
QJsonObject EventNormalizer::synthetic(const QString &type, int s)
{
	QJsonObject user{{"id", "9007199254740993"},
			 {"nickname", "Test viewer <script>"},
			 {"unique_id", "fixture"},
			 {"avatar_url", ""}};
	QJsonObject data{{"user", user}};
	if (type == "chat")
		data["comment"] = "Hello from the offline generator!";
	if (type == "gift") {
		data["gift_id"] = "5655";
		data["gift_name"] = "Rose";
		data["repeat_count"] = QString::number(s);
		data["repeat_end"] = s >= 3;
		data["group_id"] = "fixture-streak";
		data["gift_image_url"] = "";
	}
	if (type == "like") {
		data["count"] = "5";
		data["total"] = QString::number(s * 5);
	}
	if (type == "roomUser")
		data["total"] = QString::number(s * 10);
	if (type == "state") {
		data["state"] = "Disconnected";
		data["synthetic"] = true;
	}
	if (type == "unknown")
		data["#900"] = "9007199254740999";
	auto e = fromJson({{"method", "FixtureMessage"},
			   {"messageId", QString("fixture-%1-%2").arg(type).arg(s)},
			   {"history", false},
			   {"normalized", QJsonObject(data)}},
			  "@fixture");
	e["type"] = type;
	e["data"] = data;
	e["synthetic"] = true;
	return e;
}
} // namespace tt
