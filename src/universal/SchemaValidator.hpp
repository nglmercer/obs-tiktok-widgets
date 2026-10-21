#pragma once
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QStringList>
#include <cmath>
#include "../../web/universal/schemas/native-schemas.hpp"
namespace uw {
inline bool supportedSchema(const QJsonValue &value, int depth = 0)
{
	if (depth > 64)
		return false;
	if (value.isBool())
		return true;
	if (!value.isObject())
		return false;
	const auto s = value.toObject();
	const QStringList allowed{"$schema",     "$id",       "$ref",        "$comment",    "$defs",
				  "definitions", "type",      "required",    "properties",  "additionalProperties",
				  "items",       "minItems",  "maxItems",    "uniqueItems", "minLength",
				  "maxLength",   "pattern",   "minimum",     "maximum",     "const",
				  "enum",        "title",     "description", "default",     "examples",
				  "readOnly",    "writeOnly", "deprecated"};
	for (auto it = s.begin(); it != s.end(); ++it)
		if (!allowed.contains(it.key()) && !it.key().startsWith("x-"))
			return false;
	if (s.contains("type") && !s["type"].isString())
		return false;
	if (s.contains("$ref") && !s["$ref"].toString().startsWith("#/"))
		return false;
	if (s.contains("pattern") && !QRegularExpression(s["pattern"].toString()).isValid())
		return false;
	for (const auto &key : QStringList{"properties", "definitions", "$defs"}) {
		const auto group = s[key].toObject();
		for (auto it = group.begin(); it != group.end(); ++it)
			if (!supportedSchema(it.value(), depth + 1))
				return false;
	}
	for (const auto &key : QStringList{"items", "additionalProperties"})
		if (s.contains(key) && !supportedSchema(s[key], depth + 1))
			return false;
	return true;
}
// Same bounded draft-07 vocabulary as the browser SDK; schema data is generated.
inline bool validate(const QJsonValue &schemaValue, const QJsonValue &value, const QJsonObject &root, int depth = 0)
{
	if (depth > 64)
		return false;
	if (schemaValue.isBool())
		return schemaValue.toBool();
	const auto s = schemaValue.toObject();
	if (s.contains("$ref")) {
		const auto ref = s["$ref"].toString();
		if (!ref.startsWith("#/"))
			return false;
		QJsonValue target(root);
		for (auto part : ref.mid(2).split('/'))
			target = target.toObject()[part.replace("~1", "/").replace("~0", "~")];
		return !target.isUndefined() && validate(target, value, root, depth + 1);
	}
	const auto type = s["type"].toString();
	if ((!type.isEmpty()) &&
	    !((type == "object" && value.isObject()) || (type == "array" && value.isArray()) ||
	      (type == "string" && value.isString()) || (type == "boolean" && value.isBool()) ||
	      (type == "null" && value.isNull()) || (type == "number" && value.isDouble()) ||
	      (type == "integer" && value.isDouble() && std::floor(value.toDouble()) == value.toDouble())))
		return false;
	if (s.contains("const") && s["const"] != value)
		return false;
	if (s.contains("enum") && !s["enum"].toArray().contains(value))
		return false;
	if (value.isString()) {
		const auto text = value.toString();
		const auto length = text.toUcs4().size();
		if (length < s["minLength"].toInt(0) || length > s["maxLength"].toInt(1000000))
			return false;
		if (s.contains("pattern") && !QRegularExpression(s["pattern"].toString()).match(text).hasMatch())
			return false;
	}
	if (value.isDouble() && (!std::isfinite(value.toDouble()) ||
				 (s.contains("minimum") && value.toDouble() < s["minimum"].toDouble()) ||
				 (s.contains("maximum") && value.toDouble() > s["maximum"].toDouble())))
		return false;
	if (value.isArray()) {
		const auto a = value.toArray();
		if (a.size() < s["minItems"].toInt(0) || a.size() > s["maxItems"].toInt(1000000))
			return false;
		for (int i = 0; i < a.size(); ++i) {
			if (s.contains("items") && !validate(s["items"], a[i], root, depth + 1))
				return false;
			if (s["uniqueItems"].toBool())
				for (int j = 0; j < i; ++j)
					if (a[i] == a[j])
						return false;
		}
	} else if (value.isObject()) {
		const auto o = value.toObject(), properties = s["properties"].toObject();
		for (const auto &key : s["required"].toArray())
			if (!o.contains(key.toString()))
				return false;
		for (auto it = o.begin(); it != o.end(); ++it) {
			if (QStringList{"__proto__", "prototype", "constructor"}.contains(it.key()))
				return false;
			if (properties.contains(it.key())) {
				if (!validate(properties[it.key()], it.value(), root, depth + 1))
					return false;
			} else if (s.contains("additionalProperties") &&
				   !validate(s["additionalProperties"], it.value(), root, depth + 1))
				return false;
		}
	}
	return true;
}
inline bool conforms(const char *json, const QJsonValue &value)
{
	const auto schema = QJsonDocument::fromJson(json).object();
	return validate(schema, value, schema);
}
} // namespace uw
