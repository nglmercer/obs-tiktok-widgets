#pragma once
#include "SchemaValidator.hpp"
#include <QDateTime>
#include <atomic>
namespace uw {
inline QJsonObject normalizeFields(const QJsonObject &mapping, const QJsonObject &input, int index)
{
	QJsonObject result;
	for (auto it = mapping.begin(); it != mapping.end(); ++it) {
		const auto rule = it.value().toArray();
		const auto value = input[rule[index].toString()];
		const auto kind = rule[2].toString();
		if (kind == "boolean")
			result[it.key()] = value.isBool() ? value : rule[3];
		else if (kind == "counter") {
			if (value.isString() && QRegularExpression("^[0-9]{1,20}$").match(value.toString()).hasMatch())
				result[it.key()] = value;
			else if (value.isDouble() && value.toDouble() >= 0 && value.toDouble() <= 9007199254740991.0 &&
				 std::floor(value.toDouble()) == value.toDouble())
				result[it.key()] = QString::number(static_cast<qulonglong>(value.toDouble()));
			else
				result[it.key()] = rule[3];
		} else
			result[it.key()] = value.isString() ? value : rule[3];
	}
	return result;
}
inline QJsonObject normalizeData(const QString &type, const QJsonObject &data, const QJsonObject &user, int index)
{
	const auto mappings = QJsonDocument::fromJson(mappingsSchema).object();
	const auto definitions = mappings["definitions"].toObject();
	if (!definitions.contains(type))
		return data;
	auto result = normalizeFields(definitions[type].toObject(), data, index);
	result["user"] = normalizeFields(mappings["user"].toObject(), user, index);
	return result;
}
inline QString canonicalType(const QJsonObject &event)
{
	auto type = event["type"].toString();
	const auto display = event["native"]
				     .toObject()["data"]
				     .toObject()["common"]
				     .toObject()["displayText"]
				     .toObject()["key"]
				     .toString();
	if (type == "social" && event["method"] == "WebcastSocialMessage" &&
	    display.contains("follow", Qt::CaseInsensitive) && !display.contains("unfollow", Qt::CaseInsensitive))
		type = "follow";
	return "tiktok." + (type == "roomUser" ? QString("room_stats") : type);
}
inline bool validEvent(const QJsonObject &event)
{
	if (!conforms(eventSchema, event))
		return false;
	const auto timestamp = event["timestamp"].toString();
	const auto date = QDateTime::fromString(timestamp, Qt::ISODateWithMs);
	if (!date.isValid() ||
	    !(timestamp == date.toUTC().toString(Qt::ISODateWithMs) || timestamp == date.toUTC().toString(Qt::ISODate)))
		return false;
	const auto payloads = QJsonDocument::fromJson(payloadsSchema).object()["definitions"].toObject();
	if (payloads.contains(event["type"].toString())) {
		const auto schema = payloads[event["type"].toString()].toObject();
		if (!validate(schema, event["data"], schema))
			return false;
	}
	return true;
}
inline QJsonObject fromNative(const QJsonObject &event)
{
	const auto type = canonicalType(event);
	const auto message = event["messageId"].toString();
	const auto room = event["room"].toString();
	const auto received = event["receivedTimestamp"].toString();
	static std::atomic<quint64> sequence{0};
	const auto id = !message.isEmpty() && message != "0"
				? room + ":" + message
				: "obs.native:" + received + ":" + QString::number(++sequence);
	return {{"version", 1},
		{"id", id},
		{"source", "tiktok.native"},
		{"type", type},
		{"timestamp",
		 QDateTime::fromMSecsSinceEpoch(received.toLongLong()).toUTC().toString(Qt::ISODateWithMs)},
		{"data", normalizeData(type, event["data"].toObject(), event["data"].toObject()["user"].toObject(), 0)},
		{"metadata",
		 QJsonObject{{"originInstance", "obs.native"}, {"hopCount", 0}, {"room", room}, {"legacy", event}}}};
}
} // namespace uw
