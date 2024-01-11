import React from "react";
import { IResourceComponentsProps, useShow, useTranslate } from "@refinedev/core";
import { Show, NumberField, DateField, TextField } from "@refinedev/antd";
import { Typography } from "antd";
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { IResin } from "./model";
import { enrichText } from "../../utils/parsing";
import { useNavigate } from "react-router-dom";
dayjs.extend(utc);

const { Title } = Typography;

export const ResinShow: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { queryResult } = useShow<IResin>({
    liveMode: "auto",
  });
  const { data, isLoading } = queryResult;

  const record = data?.data;

  const formatTitle = (item: IResin) => {
    let vendorPrefix = "";
    if (item.vendor) {
      vendorPrefix = `${item.vendor.name} - `;
    }
    return t("resin.titles.show_title", {
      id: item.id,
      name: vendorPrefix + item.name,
      interpolation: { escapeValue: false },
    });
  };

  const gotoVendor = (): undefined => {
    const URL = `/vendor/show/${record?.vendor?.id}`;
    navigate(URL);
  };

  const gotoSpools = (): undefined => {
    const URL = `/bottle#filters=[{"field":"resin.id","operator":"in","value":[${record?.id}]}]`;
    navigate(URL);
  };

  return (
    <Show isLoading={isLoading} title={record ? formatTitle(record) : ""}>
      <Title level={5}>{t("resin.fields.id")}</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>{t("resin.fields.vendor")}</Title>
      <button
        onClick={gotoVendor}
        style={{ background: "none", border: "none", color: "blue", cursor: "pointer", paddingLeft: 0 }}
      >
        {record ? record.vendor?.name : ""}
      </button>
      <Title level={5}>{t("resin.fields.registered")}</Title>
      <DateField
        value={dayjs.utc(record?.registered).local()}
        title={dayjs.utc(record?.registered).local().format()}
        format="YYYY-MM-DD HH:mm:ss"
      />
      <Title level={5}>{t("resin.fields.name")}</Title>
      <TextField value={record?.name} />
      {/* <Title level={5}>{t("resin.fields.id")}</Title>
      {vendorIsLoading ? <>Loading...</> : <>{vendorData?.data?.id}</>} */}
      <Title level={5}>{t("resin.fields.color_hex")}</Title>
      <TextField value={record?.color_hex} />
      <Title level={5}>{t("resin.fields.material")}</Title>
      <TextField value={record?.material} />
      <Title level={5}>{t("resin.fields.price")}</Title>
      <NumberField value={record?.price ?? ""} />
      <Title level={5}>{t("resin.fields.density")}</Title>
      <NumberFieldUnit
        value={record?.density ?? ""}
        unit="g/cm³"
        options={{
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }}
      />
      <Title level={5}>{t("resin.fields.diameter")}</Title>
      <NumberFieldUnit
        value={record?.diameter ?? ""}
        unit="mm"
        options={{
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }}
      />
      <Title level={5}>{t("resin.fields.weight")}</Title>
      <NumberFieldUnit
        value={record?.weight ?? ""}
        unit="g"
        options={{
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }}
      />
      <Title level={5}>{t("resin.fields.bottle_weight")}</Title>
      <NumberFieldUnit
        value={record?.bottle_weight ?? ""}
        unit="g"
        options={{
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }}
      />
      <Title level={5}>{t("resin.fields.settings_cure_temp")}</Title>
      {!record?.settings_cure_temp ? (
        <TextField value="Not Set" />
      ) : (
        <NumberFieldUnit value={record?.settings_cure_temp ?? ""} unit="°C" />
      )}
      <Title level={5}>{t("resin.fields.settings_cure_time")}</Title>
      {!record?.settings_cure_time ? (
        <TextField value="Not Set" />
      ) : (
        <NumberFieldUnit value={record?.settings_cure_time ?? ""} unit="s" />
      )}
      <Title level={5}>{t("resin.fields.settings_wash_time")}</Title>
      {!record?.settings_wash_time ? (
        <TextField value="Not Set" />
      ) : (
        <NumberFieldUnit value={record?.settings_wash_time ?? ""} unit="s" />
      )}
      <Title level={5}>{t("resin.fields.article_number")}</Title>
      <TextField value={record?.article_number} />
      <Title level={5}>{t("resin.fields.comment")}</Title>
      <TextField value={enrichText(record?.comment)} />
      <Title level={5}>{t("resin.fields.bottles")}</Title>
      <button
        onClick={gotoBottles}
        style={{ background: "none", border: "none", color: "blue", cursor: "pointer", paddingLeft: 0 }}
      >
        {record ? formatTitle(record) : ""}
      </button>
    </Show>
  );
};

export default ResinShow;
